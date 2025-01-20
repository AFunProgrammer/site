const fs = require('fs');
const path = require('path');
const uuid = require('uuid');

// settings
const settings = require("./private/settings/private.json");
// secure functions
const { serverObfuscateData } = require('./private/code/crypto_utils.js');


// required connectivity modules
const { Client } = require('pg');

const client = new Client({
  host: settings.blog.postgres.server,
  port: settings.blog.postgres.port || 5432,
  user: settings.blog.postgres.user,
  password: settings.blog.postgres.password,
  database: settings.blog.postgres.database
});

class OBlog {
  static globalInstance;

  constructor(postgresSettings, fileSettings) {
    this.sqlSettings = postgresSettings;
    this.filSettings = fileSettings;

    this.setupError = false;
    this.createBlogTable();
    ///////////////////////////////////////////////////
    // TBD: Add Attachments in the future
    ///////////////////////////////////////////////////
    
    //this.filePathExists();
  }

  static getGlobalInstance() {
    if (OBlog.globalInstance === undefined) {
      OBlog.globalInstance = new OBlog(settings.blog.postgres, settings.blog.files);
    }

    return OBlog.globalInstance;
  }

  filePathExists() {
    if (!fs.existsSync(this.filSettings.path)) {
      this.setupError = true;
    }
  }

  fileCopy(dstFileName, srcFileName){
    if (this.setupError) {
      console.log(`fileCopy: Cannot Write, Setup Error`);
      return;
    }

    let savePath = path.normalize(this.filSettings.path + '/' + dstFileName);

    try {
      fs.copyFile(srcFileName, savePath, fs.constants.COPYFILE_EXCL, (err) => {
        if (err) {
          console.error(`fileCopy: failed to copy file: ${srcFileName}`, err);
        } else {
          console.log(`fileCopy: moved file: ${srcFileName} to ${savePath}`);
        }
      });
    } catch (err) {
      console.error(`fileCopy: failed to copy file: ${srcFileName}`, err);
    }
  }

  fileWrite(fileName, fileBlob) {
    if (this.setupError) {
      console.log(`fileWrite: Cannot Write, Setup Error`);
      return;
    }

    let savePath = path.normalize(this.filSettings.path + '/' + fileName);

    try {
      fs.writeFileSync(savePath, Buffer.from(fileBlob));
      console.log(`fileWrite: wrote file: ${fileName}`);
    } catch (err) {
      console.error(`fileWrite: failed to write file:`, err);
    }
  }

  fileRead(fileName) {
    if (this.setupError) {
      console.log(`fileRead: Cannot Read, Setup Error`);
      return;
    }

    let readPath = path.normalize(this.filSettings.path + '/' + fileName);
    let data = "";

    try {
      if (!fs.existsSync(readPath)) {
        console.log(`fileRead: file does not exist: ${fileName}`);
        return;
      }
      data = fs.readFileSync(readPath, 'utf8');
    } catch (err) {
      console.error(`fileRead: failed to read file:`, err);
    }

    return data;
  }

  async createBlogTable() {
    const sqlCreateTable = `
      CREATE TABLE IF NOT EXISTS blog (
        id SERIAL PRIMARY KEY,
        username text,
        userid text,
        title text,
        content text,
        backstyle integer,
        backcolor text,
        attachments text[],
        created timestamp with time zone NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC')
      );
    `;

    try {
      // connect to the database
      await client.connect();

      // Ensure the "blog" table is created and exists
      const res = await client.query(sqlCreateTable);
      console.log('createBlogTable: \'blog\' table was created successfully');
    } catch (err) {
      console.error('createBlogTable: error creating table:', err);
      this.setupError = true;
    }
  }

  async insertBlog(userData, blogData){
    if (this.setupError) {
      console.log(`addBlog: Cannot Add Blog, Setup Error`);
      return;
    }

    let   recordId;
    const username = userData.username;
    const userid = serverObfuscateData(userData.userid);

    const title = blogData.title;
    const content = blogData.content;
    const backStyle = Number(blogData.backstyle);
    const backColor = blogData.backcolor;

    const queryInsert = `
      INSERT INTO blog (username, userid, title, content, backstyle, backcolor)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `;

    const queryValues = [username, userid, title, content, backStyle, backColor];

    try {
      const result = await client.query(queryInsert, queryValues);
      recordId = result.rows[0].id;
    } catch (err) {
      console.error('addBlog: error when inserting row:', err);
    }

    return recordId;
  }

  async alterBlog(blogData) {
    if (this.setupError) {
      console.log(`alterBlog: Cannot Add Blog, Setup Error`);
      return;
    }

    const blogId = blogData.id;
    const title = blogData.title;
    const content = blogData.content;
    const backStyle = Number(blogData.backstyle);
    const backColor = blogData.backcolor;

    const queryUpdate = `
      UPDATE blog
      SET title = $1, content = $2, backstyle = $3, backcolor = $4
      WHERE id = $5;
    `;

    const queryValues = [title, content, backStyle, backColor, blogId];

    try {
      const result = await client.query(queryUpdate, queryValues);
    } catch (err) {
      console.error('alterBlog: error when updating row:', err);
    }

    return blogId;
  }

  async updateBlog(userData, blogData){
    if (this.setupError) {
      console.log(`updateBlog: Cannot Add Blog, Setup Error`);
      return;
    }
    
    let blogId = 'New';

    if ( blogData && blogData.id && blogData.id != 'New' ){
      // verify that the userData matches the entered blog
      const queryUpdate = `SELECT * FROM blog WHERE id = $1 AND username = $2 AND userid = $3;`;

      const queryValues = [blogData.id, userData.username, serverObfuscateData(userData.userid)];
      const result = await client.query(queryUpdate, queryValues);

      // alter the existing blog
      if ( result.rowCount > 0 ){
        blogId = this.alterBlog(blogData);
      }
    } else {
      // insert a new blog entry
      blogId = this.insertBlog(userData,blogData);
    }
    
    return blogId; // return Id for redirect
  }


  async getBlogUsers(){
    if (this.setupError) {
      console.log(`getBlogUsers: cannot get any blog entry there is a setup error`);
      return;
    }

    const querySelectBlog = `SELECT userid, username FROM blog WHERE userid IN (SELECT DISTINCT userid FROM blog);`;
    let result = [];

    try {
      result = await client.query(querySelectBlog);
    } catch (err) {
      console.error('getBlogUsers: error when querying for userID and blogID:', err);
    }

    return result;
  }

  async getBlogUserEntries(userID){
    if (this.setupError) {
      console.log(`getBlogUserEntries: cannot get any blog entry there is a setup error`);
      return;
    }

    const querySelectBlog = `SELECT * FROM blog WHERE created=$1 ORDER BY created LIMIT 200;`;
    const queryValues = [serverObfuscateData(userID)];
    let result = [];

    try {
      result = await client.query(querySelectBlog, queryValues);
    } catch (err) {
      console.error('getBlogUserEntries: error when querying for userID and blogID:', err);
    }

    return result;
  }

  async getBlog(blogID){
    if (this.setupError) {
      console.log(`getBlog: cannot get any blog entry there is a setup error`);
      return;
    }

    const querySelectBlog = `SELECT * FROM blog WHERE id=$1;`;
    const queryValues = [blogID];
    let result = [];
    try {
      const res = await client.query(querySelectBlog, queryValues);
      if ( res.rows.length > 0 ){
        result = res.rows[0];
        //console.log(result);
      }
    } catch (err) {
      console.error('getBlog: error when querying for userID and blogID:', err);
    }

    return result;
  }

  async getMostRecentBlogs(){
    if (this.setupError) {
      console.log(`getMostRecentBlogs: cannot get any blog there is a setup error`);
      return;
    }
    const querySelectBlog = `SELECT * FROM blog ORDER BY created DESC LIMIT 200;`;
    let result = [];
    try {
      const res = await client.query(querySelectBlog);
      if ( res.rows.length > 0 ){
        result = res.rows;
      }
    } catch (err) {
      console.error('getMostRecentBlogs: error when querying for blogs:', err);
    }

    return result;
  }

  // delete blog based upon the userID (email address) and the blogID (unique primary key)
  async deleteBlog(userData, blogID) {
    if (this.setupError) {
      console.log(`delBlog: cannot get any blog entry there is a setup error`);
      return;
    }

    // Implement deletion logic here
    const queryDeleteBlog = `DELETE FROM blog WHERE id=$1 AND userid=$2;`;
    const queryValues = [blogID, serverObfuscateData(userData.userId)];
    let result = [];

    try {
      result = await client.query(queryDeleteBlog, queryValues);
    } catch (err) {
      console.error('deleteBlog: error when deleting blog:', err);
    }

    return result;
  }

  generateUuidForFile(fileName) {
    if (this.setupError) {
      console.log(`generateUuidForFile: cannot get any blog entry there is a setup error`);
      return;
    }

    if (fileName === undefined) {
      return "error";
    }
    const fileExt = path.extname(fileName);
    const baseName = uuid.v4().toString();
    const uuidFileName = `${baseName}${fileExt}`;

    return uuidFileName;
  }
}

module.exports = OBlog;
