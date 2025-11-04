// local child process
import { exec } from 'node:child_process';
import { spawn } from 'node:child_process';
import homeDir from 'os';

//settings
// import configuration
import { settings } from './config.js';

// ssh
import ssh2 from "ssh2";
import speakeasy from "speakeasy";
import { isGeneratorObject } from 'node:util/types';
const conn = new ssh2.Client();

// e.g. ID  EXT   RESOLUTION FPS CH │   FILESIZE   TBR PROTO │ VCODEC          VBR ACODEC      ABR ASR MORE INFO

function createFieldDef(fieldName){
  let fieldDef = { 
    name: fieldName,
    group: 0,
    start: 0,
    end: 0,
    combined: false,
    which: 0
  };

  return fieldDef;
}

function extractFieldsAndSize(formatHeaderLine){
  var fieldDefs = new Array(); // may have to change this in the future...d
  let groupFields = [];
  let startIdx = 0;
  let endIdx = 0;

  for ( let grp=0; grp < 3; grp++ ){
    if ( endIdx > 0 ){
      startIdx = endIdx + 1;
    }
    endIdx = formatHeaderLine.indexOf("|", startIdx+1);
    if ( endIdx == -1 ){
      endIdx = formatHeaderLine.length;
    }
    groupFields.push(formatHeaderLine.slice(startIdx,endIdx));
  }

  for ( let idx=0; idx < groupFields.length; idx++ ){
    const fields = groupFields[idx].split(' ').filter(word => word !== "");

    for ( const field of fields ){
      if ( field == "INFO" ){
        continue;
      }

      let fieldDef = createFieldDef(field);
      let start = formatHeaderLine.indexOf(field);
      let end = start + field.length;
      //fieldDef.name = field;
      fieldDef.group = idx;
      fieldDef.start = start;
      fieldDef.end = end;
      fieldDef.combined = false;
      fieldDef.which = 0;
      fieldDefs.push(fieldDef);
    }
  }
  
  for ( let fld=0; fld < fieldDefs.length; fld++ ){
    if ( fieldDefs[fld].group == 0 && fieldDefs[fld+1].group == 0 ){
      fieldDefs[fld].end = fieldDefs[fld+1].start - 1;
    } 
    if ( fieldDefs[fld].group == 0 && fieldDefs[fld+1].group == 1 ) {
      fieldDefs[fld+1].start = formatHeaderLine.indexOf(groupFields[1]);
    }
    if ( fieldDefs[fld].group == 1 && fieldDefs[fld+1].group == 1 ) {
      fieldDefs[fld+1].start = fieldDefs[fld].end + 1;
    }
    if ( fieldDefs[fld].group == 2 ) {
      if ( fieldDefs[fld].name == "VCODEC" || fieldDefs[fld].name == "ACODEC"){
        fieldDefs[fld].combined = true;
        fieldDefs[fld].end = fieldDefs[fld+1].end;
        fieldDefs[fld].which = 0;
        fieldDefs[fld+1].combined = true;
        fieldDefs[fld+1].start = fieldDefs[fld].start;
        fieldDefs[fld+1].which = 1;
        fld += 2;
        continue;
      }
      if ( fieldDefs[fld].name == 'MORE' ){
        fieldDefs[fld].end = 999;
      }
    }
  }

  return fieldDefs;
}

function extractFormatInfoFromLine(fieldDefs, formatData){
  var fieldData = new Object();

  if ( !fieldDefs || formatData == "" ){
    return fieldData;
  }

  for( const field of fieldDefs ){
    let fieldString = formatData.slice(field.start,field.end);
    if ( field.combined == true ){
      fieldString = fieldString.split(' ')[field.which];
    }

    fieldData[field.name] = fieldString.trim();
  }

  return fieldData;
}

class OMediaDownloader {
  static useLocal = true;

  static runSSHCommand(commandString, outputFunction){
    conn.exec(commandString, function (err, stream) {
      if (err) {
        console.log(`unknown error: ${err}`);
        return;
      }

      var stdout = "";
      var stderr = "";

      stream.on("close", function () {
          if ( outputFunction )
            outputFunction(stdout,stderr);
        }).on("data", function (data) {
          stdout += data + "\n";
        }).stderr.on("data", function (data) {
          stderr += data + "\n";
        });
      }
    );
  }

  static runLocalCommand(commandString, outputFunction){
    var stdout;
    var stderr;
    
    const cmdSpawn = spawn(commandString, [], { shell: true });

    cmdSpawn.stdout.on('data', (data) => {
      let lines = data.toString().split('\r');
      for( let line of lines ) {
        line = line.replace('\n','');
        console.log(`stdout: ${line}`);
        stdout += line;// + "\n";
      };
    });

    cmdSpawn.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      stderr += data;
    });

    cmdSpawn.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      if ( outputFunction )
        outputFunction(stdout,stderr);
    });

    cmdSpawn.on('error', (error) => {
      console.log(`error in spawning ${commandString}`);
      console.error(error);
    });
  }

  static runCommand(commandString, outputFunction){
    if ( this.useLocal ){
      this.runLocalCommand(commandString, outputFunction);
    } else {
      this.runSSHCommand(commandString, outputFunction);
    }
  }

  // ./yt-dlp.sh --list-formats -s -v https://www.youtube.com/watch?v=IQLn6jgvrN0
  // ./yt-dlp.sh --list-formats https://www.youtube.com/watch?v=IQLn6jgvrN0

  // ID  EXT   RESOLUTION FPS CH │   FILESIZE   TBR PROTO │ VCODEC          VBR ACODEC      ABR ASR MORE INFO
  // ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // 18  mp4   640x360     30  2 │ ≈  1.91MiB  645k https │ avc1.42001E         mp4a.40.2       44k 360p, MWEB

  // ./yt-dlp.sh -f 18 -v https://www.youtube.com/watch?v=IQLn6jgvrN0
  // If you want a video and audio in one file, use + like -f 'abc_01+audio_02'
  //  and make sure to use --merge-output-format to choose your preferred container format like mp4

  static getMediaInfo(downloadUrl) {
    let command = "";

    if ( this.useLocal ) {
      command = "~/Documents/programming/yt-dlp/yt-dlp.sh";
    }else {
      command = "~/git/yt-dlp/yt-dlp.sh";
    }

    command += ` --list-formats ${downloadUrl}`;

    this.runCommand(command,this.decipherMediaInfo);
  }

  static decipherMediaInfo(stdout,stderr){
    if ( stdout == null ){
      console.log(`deipherMediaInfo: no stdout data to decipher from`);
      return;
    }

    console.log(`received errors: ${stderr}`);
    const lines = stdout.split('\n');
    let formatData = new Array();

    let infoStart = 0;
    
    while ( lines[infoStart].includes("RESOLUTION FPS") == false && infoStart < lines.length){
      infoStart++;
      //console.log(`current line being read: ${infoStart} line: ${lines[infoStart]}`);
    }

    if ( infoStart >= lines.length)
      return "";

    let fieldDefs = extractFieldsAndSize(lines[infoStart]);

    for( let line = infoStart+2; line < lines.length; line++ ){
      formatData.push(extractFormatInfoFromLine(fieldDefs,lines[line]));
    }

    console.log('received the follow fields: ');
    console.log(fieldDefs);
    console.log('--------------------------------');
    console.log('received the following format information');
    console.log(formatData);

    return formatData;
  }

  static getMedia(downloadUrl, formatInfo=null, readyFunction=null){
    let command = "";
    if ( this.useLocal ){
      command = `~/Documents/programming/yt-dlp/yt-dlp.sh --force-overwrites ${downloadUrl} -o ~/Videos/youtube`;
    } else {
      command = `~/git/yt-dlp/yt-dlp.sh --force-overwrites ${downloadUrl} -o /home/samba/share/video`;
    }

    this.runCommand(command,readyFunction);
  }
}

////////////////////////////////////
// SSH for offloading heavy tasks
////////////////////////////////////
try{
  conn.on("ready", () => {
      console.log("Client :: Connected Successfully");
    }).on("keyboard-interactive", (name, instructions, instructionsLang, prompts, finish) => {
        // Handle Interactive Prompt
        const answers = prompts.map((prompt) => {
          console.log(`ssh2: connection: requesting: ${prompt.prompt}`);

          if (prompt.prompt.includes("Password")) {
            console.log("\tsending Password");
            return settings.ssh.password;
          } else if (prompt.prompt.includes("Verification code")) {
            // generate TOTP
            let totpCode = speakeasy.totp({
              secret: settings.ssh.otp,
              encoding: "base32",
            });
            console.log(`\tsending Verification Code`);
            return totpCode; // Send the generated TOTP code
          } else {
            return ""; // For other prompts, send empty or default responses
          }
        });
        finish(answers);
      }
    ).connect({
      host: settings.ssh.server,
      port: settings.ssh.port,
      username: settings.ssh.user,
      tryKeyboard: true,
    });
}catch(error){
  OMediaDownloader.useLocal = true;
  console.error(error);
}
setTimeout(() => {
  console.log("✅ SSH connected, continuing app startup...");
}, 1000);


//~/Documents/programming/yt-dlp/yt-dlp.sh --list-formats https://www.youtube.com/watch?v=IQLn6jgvrN0
export default OMediaDownloader;
