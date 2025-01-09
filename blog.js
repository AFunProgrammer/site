const fs = require('fs');
const path = require('path');

// Class and Object Definitions
// Manage Blog User Data
//  neatly and concisely as a static object
//  to make it clear all the functions and 
//  variables needed to work properly
class OBlogs{
  static #rootPath = __dirname + "/private/blogs";
  static #userList = [];

  static getBlogPath(userID){
    let blogPath = "";
    try {    
      blogPath = path.normalize(`${this.#rootPath}/${userID}`); //path to the game to load up
    } catch(error) {
      console.error(error);
      throw(error);
    }

    return blogPath;
  }


  static getBlogFromDisk(userID){
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

  // userIDExist
  static blogExists(userID){
    let blogPath = this.getBlogPath(userID);
    
    try {
      // check to see if the path to the game exists
      return fs.existsSync(blogPath);
    } catch(err) {
      console.error('OBlogs::userIDExists: Error occurred:', err);
    }

    return false;
  }

  // getGameFiles - Get the list of files associated with a specific userID
  static getBlogFiles(userID){
    let blogPath = this.getblogPath(userID); //path to the game to load up
    let gameFiles = [];

    try {
      // check to see if the path to the game exists
      if( this.userIDExists(userID) == false ){
        console.log(`OBlogs::getGameFiles: checking for userID: ${userID} returned error`);
        return null;
      }   
    
      let files = fs.readdirSync(blogPath, {withFileTypes: true});
      files.forEach( file => {
        if ( file.isFile() ){
          gameFiles.push(file.name);
        }
        //console.log(`OBlogs::getGameFiles: file found: ${file.name}`);
      });
    } catch (err) {
      console.error('OBlogs::getGameFiles: Error occurred:', err);
      return null;
    }

    return gameFiles;
  }

  static loadAndConvertFile(filePath, format){
    if ( filePath == "" || format == "" ){
      console.log(`OBlogs::loadAndConvertFile: invalid FilePath: ${filePath} or Format: ${format}`);
      return null;
    }

    try {
      // check to see if the file exists
      if( fs.existsSync(filePath) == false ){
        console.log(`OBlogs::loadAndConvertFile: checking for path:${filePath} returned error`);
        return null;
      }
    } catch (err) {
      console.error('OBlogs::loadAndConvertFile: error occurred', err);
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
      console.error('OBlogs::loadAndConvertPNG: error occurred', err);
    }

    return fileData;
  }

  static loadAndConvertTXT(txtPath,format){
    let fileData = null;
    try {
      // Load the file and convert to a string if necessary
      fileData = fs.readFileSync(txtPath, {encoding: 'utf8'});
    } catch (err) {
      console.error('OBlogs::loadAndConvertTXT: error occurred', err);
    }

    return fileData;
  }

  static getBlogDataAsJSON(userID){
    let blogPath = this.getblogPath(userID); //path to the game to load up
    let gameFiles = null;
    let gameData = [];
    let jsonData = "";

    try {
      gameFiles = this.getGameFiles(userID);

      if ( gameFiles == null || gameFiles.length == 0 ){
        console.log(`OBlogs::getGameData: no files found for userID: ${userID}`);
        return null;
      }

      for ( const file of gameFiles ){
        // ignore 'createdby.txt' to avoid sending sensitive data from the server
        if ( path.parse(file)['base'] == 'createdby.txt' ){
          continue;
        }

        let filePath = path.normalize(`${blogPath}/${file}`);
        let fileInfo = this.getMetaDataFromName(file);
        fileInfo["data"] = this.loadAndConvertFile(filePath);

        gameData.push(fileInfo);
      }

      jsonData = JSON.stringify(gameData,null,2);
      //console.log(`OBlogs::getGameData: JSON Data: ${jsonData}`);
    } catch (err) {
      console.error('getGameData Error occurred:', err);
    }

    return jsonData;
  }


  static getBlogUsersFromDisk(){
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

// have to do an export statement rather than doing an export keyword
//  this was very confusing and I spent 20-30 minutes trying to solve
//  this very dumb error for important a class from a file that is
//  loaded in to NodeJS using require('./categories.js')

module.exports = OBlogs;