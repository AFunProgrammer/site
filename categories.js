import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Class and Object Definitions
// Manage The Categories Game Data
//  neatly and concisely as a static object
//  to make it clear all the functions and 
//  variables needed to work properly
class OCategories{
  static #rootPath = path.join(__dirname, "/private/categories/games");
  static #nextGameNumFile = path.join(__dirname, "/private/categories/games/currentsave.txt");
  static #currentGameNum = "-1";
  static #listAtGameNum = "-1";
  static #gameList = [];

  static getGamePath(gameID){
    let gamePath = "";
    try {    
      gamePath = path.normalize(`${this.#rootPath}/${gameID}`); //path to the game to load up
    } catch(error) {
      console.error(error);
      throw(error);
    }

    return gamePath;
  }

  static getCurrentGame(){
    if ( this.#currentGameNum == "-1"){
      this.getCurrentGameFromDisk();
    }

    return this.#currentGameNum;   
  }

  static getCurrentGameAndUpdate(){
    let currentGame = "";

    if ( this.#currentGameNum == "-1"){
      this.getCurrentGameFromDisk();
    }

    // Save the current game and return it after updating
    //  the pointer to the next game
    currentGame = this.#currentGameNum;

    // Increment for the next game number to be grabbed
    //  out to disk so if a failure occurs it can
    //  not stomp data that was already written
    this.updateCurrentGameToDisk()

    return currentGame;
  }

  static getCurrentGameFromDisk(){
    let number = 0;
    // Read the content of the file
    try {
      // Read the content of the file synchronously
      const data = fs.readFileSync(this.#nextGameNumFile, 'utf8');
      
      // Parse the number, increment it, and convert it back to a string
      number = parseInt(data, 10);
      
      console.log(`Retrieved Current Game From Disk: ${number}`);
    } catch (err) {
      console.error('getCurrentGAmeFromDisk Error occurred:', err);
    }
    
    // return the number but as a string with at least 5 digits in it
    //  this makes the directories look a little nicer and better
    //  visual ordering of the directories when examining (e.g. 0 => "00000")
    this.#currentGameNum = number.toString().padStart(5, '0');
  }

  // gameIDExist
  static gameIDExists(gameID){
    let gamePath = this.getGamePath(gameID);
    
    try {
      // check to see if the path to the game exists
      return fs.existsSync(gamePath);
    } catch(err) {
      console.error('OCategories::gameIDExists: Error occurred:', err);
    }

    return false;
  }

  // getGameFiles - Get the list of files associated with a specific gameID
  static getGameFiles(gameID){
    let gamePath = this.getGamePath(gameID); //path to the game to load up
    let gameFiles = [];

    try {
      // check to see if the path to the game exists
      if( this.gameIDExists(gameID) == false ){
        console.log(`OCategories::getGameFiles: checking for gameID: ${gameID} returned error`);
        return null;
      }   
    
      let files = fs.readdirSync(gamePath, {withFileTypes: true});
      files.forEach( file => {
        if ( file.isFile() ){
          gameFiles.push(file.name);
        }
        //console.log(`OCategories::getGameFiles: file found: ${file.name}`);
      });
    } catch (err) {
      console.error('OCategories::getGameFiles: Error occurred:', err);
      return null;
    }

    return gameFiles;
  }

  static loadAndConvertFile(filePath, format){
    if ( filePath == "" || format == "" ){
      console.log(`OCategories::loadAndConvertFile: invalid FilePath: ${filePath} or Format: ${format}`);
      return null;
    }

    try {
      // check to see if the file exists
      if( fs.existsSync(filePath) == false ){
        console.log(`OCategories::loadAndConvertFile: checking for path:${filePath} returned error`);
        return null;
      }
    } catch (err) {
      console.error('OCategories::loadAndConvertFile: error occurred', err);
    }

    let extPeriodIdx = filePath.lastIndexOf('.');
    let fileExt = filePath.substring(extPeriodIdx+1).toUpperCase();
    let fileBlob = null;
    
    if ( fileExt.localeCompare("PNG") == 0 ){
      fileBlob = this.loadAndConvertPNG(filePath, format);
    } else if ( fileExt.localeCompare("TXT") == 0 ) {
      fileBlob = this.loadAndConvertTXT(filePath, format);
    }

    return fileBlob;
  }

  static loadAndConvertPNG(pngPath,format){
    let fileData = null;
    try {
      // Load the file and convert to a string if necessary
      fileData = fs.readFileSync(pngPath, {encoding: null});
      fileData = fileData.toString('base64');
    } catch (err) {
      console.error('OCategories::loadAndConvertPNG: error occurred', err);
    }

    return fileData;
  }

  static loadAndConvertTXT(txtPath,format){
    let fileData = null;
    try {
      // Load the file and convert to a string if necessary
      fileData = fs.readFileSync(txtPath, {encoding: 'utf8'});
    } catch (err) {
      console.error('OCategories::loadAndConvertTXT: error occurred', err);
    }

    return fileData;
  }

  // getFileMetaDataFromName - get group and item information if it exists
  static getMetaDataFromName(fileName){
    if ( fileName == null || fileName == "" ) {
      console.log(`OCategories::getFileMetaDataFromName: bad fileName: ${fileName}`);
    }
    let metaData = {};

    let dotIndex = fileName.lastIndexOf('.');
    let name = fileName.substring(0,dotIndex).toUpperCase();
    let ext = fileName.substring(dotIndex+1).toUpperCase();;
    let type = 0; //start of type is after numbers

    if ( Number.isInteger(parseInt(name[0])) ){
      metaData["group"] = name[0];
      type++;
    }

    if ( Number.isInteger(parseInt(name[1])) ){
      metaData["item"] = name[1];
      type++;
    }

    metaData["type"] = name.substring(type).toLowerCase();

    if ( ext == "PNG" ){
      metaData["format"] = "image";
    } else if ( ext == "TXT"){
      metaData["format"] = "text";
    } else {
      metaData["format"] = "unknown";
    }

    //console.log(`OCategories::getFileMetaDataFromName: for file: ${fileName} discerned meta data: ${JSON.stringify(metaData)}`);

    return metaData;
  }

  static getGameDataAsJSON(gameID){
    let gamePath = this.getGamePath(gameID); //path to the game to load up
    let gameFiles = null;
    let gameData = [];
    let jsonData = "";

    try {
      gameFiles = this.getGameFiles(gameID);

      if ( gameFiles == null || gameFiles.length == 0 ){
        console.log(`OCategories::getGameData: no files found for gameID: ${gameID}`);
        return null;
      }

      for ( const file of gameFiles ){
        // ignore 'createdby.txt' to avoid sending sensitive data from the server
        if ( path.parse(file)['base'] == 'createdby.txt' ){
          continue;
        }

        let filePath = path.normalize(`${gamePath}/${file}`);
        let fileInfo = this.getMetaDataFromName(file);
        fileInfo["data"] = this.loadAndConvertFile(filePath);

        gameData.push(fileInfo);
      }

      jsonData = JSON.stringify(gameData,null,2);
      //console.log(`OCategories::getGameData: JSON Data: ${jsonData}`);
    } catch (err) {
      console.error('getGameData Error occurred:', err);
    }

    return jsonData;
  }

  static updateCurrentGameToDisk(){
    let number = parseInt(this.#currentGameNum, 10) + 1;

    // Read the content of the file
    try {
      // Write the incremented number back to the file synchronously
      fs.writeFileSync(this.#nextGameNumFile, number.toString(), 'utf8');
      console.log(`Wrote Current Game To Disk: ${number}`);
    } catch (err) {
      console.error('updateCurrentGameToDisk Error occurred:', err);
    }
    
    // Update the current game as well in the static variable
    this.#currentGameNum = number.toString().padStart(5, '0');
  }

  static getGameList(){
    this.getGameListFromDisk();

    if ( this.#gameList.length == 0){
      return [];
    }

    return this.#gameList;
  }

  static getGameListFromDisk(){
    if ( (this.#listAtGameNum == this.#currentGameNum) &&
       (this.#listAtGameNum.localeCompare("-1") >= 1) ){
      return; //list already retrieved and no new games added
    }

    let files = fs.readdirSync(this.#rootPath, {withFileTypes: true});

    this.#gameList = [];

    files.forEach( file => {
      if ( file.isDirectory() ){
        this.#gameList.push(file.name);
      }
      //console.log(`getGameListFromDisk: file found: ${file.name}`);
    });

    this.#listAtGameNum = this.#currentGameNum;
  }
};

export default OCategories;
