// OS requirements
const fs = require('fs');
const path = require('path');

// Utility requirements
const crypto = require('crypto');
const uuid = require('uuid');

//settings
const settings = require("./private/settings/private.json");

const { Client } = require('pg');

// Define connection parameters
//  server: postgresSettings.postgres.server -> ip address
//  port: postgresSettings.postgres.port -> default of 5432
//  password: postgresSettings.postgres.password -> text string
//  there is no user specified for the docker postgres instance...
const client = new Client({ /* Need To Fill In Data */ });


// Class and Object Definitions
// Manage Blog User Data
//  neatly and concisely as a static object
//  to make it clear all the functions and 
//  variables needed to work properly

class OBlog {
  // Static variable to hold the single instance of the class
  static globalInstance;

  constructor(postgresSettings, fileSettings) {
      // Initialize with settings from private.json
      this.sqlSettings = postgresSettings;
      this.filSettings = fileSettings;
      
      // Other initialization code might go here
      this.setupError = false; // no issues found with settings
      this.createBlogTable();
      this.filPathExists();
    }

  static getGlobalInstance() {
    if (OBlog.globalInstance === undefined) {
      OBlog.globalInstance = new OBlog(settings.blog.postgres, settings.blog.files);
    }

    return OBlog.globalInstance;
  }

  filPathExists(){
    if( fs.existsSync(this.filSettings.path) == false ){
      this.setupError = true;
    }
  }

  filWriteFile(fileName, Contents){
    if ( this.setupError == true ){
      console.log(`filWriteFile: Cannot Write, Setup Error`);
      return;
    }

    let savePath = path.normalize(this.filSettings.path + '/' + fileName);

    try {
      fs.writeFileSync(savePath, Contents);
      console.log(`filWriteFile: wrote file: ${fileName}`);
    }catch(err){
      console.error(`filWriteFile: failed to call writeFile:`, err);
    }
  }

  filReadFile(fileName){
    if ( this.setupError == true ){
      console.log(`filWriteFile: Cannot Write, Setup Error`);
      return;
    }

    let readPath = path.normalize(this.filSettings.path + '/' + fileName);
    let data = "";

    try {
      // Check to see if the file exists
      if ( fs.existsSync(readPath) == false ){
        console.log(`filReadFile: file does not exist: ${fileName}`);
        return;
      }
      // Read the file
      data = fs.readFileSync(readPath, 'utf8');
    }catch(err){
      console.error(`filReadFile: failed to call readFileSyn:`, err);
    }

    return data;
  }

  async createBlogTable(){
    const sqlCreateTable = `CREATE TABLE blog 
                            ( 
                              id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), 
                              user text, 
                              title text, 
                              content text, 
                              attachment text, 
                              background text,
                              created timestamp with time zone NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC')
                            );`;
    
    client.query(sqlCreateTable, (err, res) => {
      if (err) { 
        console.error(err); 
      } else { 
        console.log('createBlogTable: \'blog\' table was created successfully'); 
      } 
    });
  }


  // get list of userIDs to get blogs
  getBloggers(){

  }

  // get list of blogs for userID
  getUserBlogs(userID){

  }

  // get blog for userID
  getBlog(userID, blogID){

  }

  getBlogTextualData(userID, blogID){

  }

  getBlogAttachments(userID, blogID){

  }

  // add new blog for userID with blogData
  async addBlog(userID, blogData){
    const blogTitle = blogData["title"]; // text
    const blogContent = blogData["content"]; // text
    const blogAttachment = blogData["attachment"]; // array
    const blogBackground = blogData["background"];

    const uuidFileName = this.generateUuidForFile(blogAttachment.originalFilename);

    const queryInsert = "INSERT INTO blog (user, title, content, attachment, background) VALUES(%1,%2,%3,%4,%5);"
    const queryValues = [userID, blogTitle, blogContent, uuidFileName, blogBackground];

    console.log(userID);
    console.log(blogData);
    console.log(queryInsert);
    console.log(queryValues);
    return;

    try {
      const result = await client.query(queryInsert, queryValues);
      console.log('addBlog: row inserted successfully:', result);
    } catch(err) {
      console.error('addBlog: error when inserting row:', err);
    }

  }

  // del[ete] blog for userID using blogID
  delBlog(userID, blogID){
      // also delete any files on the samba share for that blog

  }

  // generate thumbnails to be store in the db itself
  generateThumbnail(file){

  }

  // no larger than 512x512
  generateThumbnailFromImage(file){

  }

  // get a frame at some time in to video where not black, no larger than 512,512
  generateThumbnailFromVideo(file){

  }

  // use a image list file or similar to get an icon that matches the extension of the file
  generateThumbnailFromFileType(file){

  }

  generateUuidForFile(fileName){
    if ( fileName === undefined ){
      return "error";
    }
    const fileExt = path.extname(fileName);
    const baseName = uuid.v4().toString();
    const uuidFileName = `${baseName}${fileExt}`;

    return uuidFileName;
  }

};

module.exports = OBlog;