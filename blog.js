import fs from 'fs';
import path from 'path';
import * as uuid from 'uuid';

// settings
// import configuration
import { settings } from './config.js';

// secure functions
import { serverObfuscateData } from './private/code/crypto_utils.js';

// required connectivity modules
import { Client } from 'pg';

class OBlog {
  static globalInstance = [];

  constructor(postgresSettings, fileSettings, blogTable) {
    this.sqlSettings = postgresSettings;
    this.filSettings = fileSettings;

    this.setupError = false;
    this.createConnection();
    this.createBlogTable(blogTable);


    if ( this.setupError == false ){
      this.tableName = blogTable; // sometimes this is left as undefined...
    }
    ///////////////////////////////////////////////////
    // TBD: Add Attachments in the future
    ///////////////////////////////////////////////////
    
    //this.filePathExists();
  }

  // default global instance called 'blog'
  static getGlobalInstance(blogTable = 'blog') {
    if (OBlog.globalInstance[blogTable] === undefined) {
      OBlog.globalInstance[blogTable] = new OBlog(settings.blog.postgres, settings.blog.files, blogTable);
    }

    return OBlog.globalInstance[blogTable];
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


  async createConnection(){
    try {
      this.client = new Client({
        host: settings.blog.postgres.server,
        port: settings.blog.postgres.port || 5432,
        user: settings.blog.postgres.user,
        password: settings.blog.postgres.password,
        database: settings.blog.postgres.database
      });
    } catch (err) {
      console.error(`createConnection: error creating client connection:`, err);
      this.setupError = true;
    }
  }

  async createBlogTable(blogTable) {
    if ( this.setupError ){
      return; // nothing can be done if connection has failed
    }

    const createQuery = `
      CREATE TABLE IF NOT EXISTS ${blogTable} (
        id SERIAL PRIMARY KEY,
        username text,
        userid text,
        title text,
        content text,
        backcolor text,
        imagename text,
        fillstyle text,
        opacity decimal default 1,
        attachments text[],
        created timestamp with time zone NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'UTC')
      );
    `;

    const queryValues = [];

    try {
      // connect to the database
      await this.client.connect();

      // Ensure the "blog" table is created and exists
      const res = await this.client.query(createQuery, queryValues);
      this.tableName = blogTable;
      console.log(`createBlogTable: \'${blogTable}\' table was created successfully`);
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
    const backColor = blogData.backcolor;
    const imageName = blogData.imagename;
    const fillStyle = blogData.fillstyle;
    const opacity = blogData.opacity;

    const queryInsert = `
      INSERT INTO ${this.tableName} (username, userid, title, content, backcolor, imagename, fillstyle, opacity)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id;
    `;

    const queryValues = [username, userid, title, content, backColor, imageName, fillStyle, opacity];

    try {
      const result = await this.client.query(queryInsert, queryValues);
      recordId = result.rows[0].id;
    } catch (err) {
      console.error('addBlog: error when inserting row:', err);
    }

    return recordId;
  }

  async alterBlog(blogData) {
    if (this.setupError) {
      console.log(`alterBlog: Cannot Alter Blog, Setup Error`);
      return;
    }

    const blogId = blogData.id;
    const title = blogData.title;
    const content = blogData.content;
    const backColor = blogData.backcolor;
    const imageName = blogData.imagename;
    const fillStyle = blogData.fillstyle;
    const opacity = blogData.opacity;
    const queryUpdate = `
      UPDATE ${this.tableName}
      SET title = $1, content = $2, backcolor = $3, imagename = $4, fillstyle = $5, opacity = $6
      WHERE id = $7;
    `;

    const queryValues = [title, content, backColor, imageName, fillStyle, opacity, blogId];

    try {
      const result = await this.client.query(queryUpdate, queryValues);
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
      const queryUpdate = `SELECT * FROM ${this.tableName} WHERE id = $1 AND username = $2 AND userid = $3;`;
      const queryValues = [blogData.id, userData.username, serverObfuscateData(userData.userid)];

      const result = await this.client.query(queryUpdate, queryValues);
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

    const querySelectBlog = `SELECT userid, username 
                             FROM ${this.tableName}
                             WHERE userid 
                             IN (SELECT DISTINCT userid FROM ${this.tableName});`;
    const queryValues = [];
    let result = [];

    try {
      result = await this.client.query(querySelectBlog, queryValues);
    } catch (err) {
      console.error('getBlogUsers: error when querying for users:', err);
    }

    return result;
  }

  async getBlogUserEntries(userID){
    if (this.setupError) {
      console.log(`getBlogUserEntries: cannot get any blog entry there is a setup error`);
      return;
    }

    const querySelectBlog = `SELECT * FROM ${this.tableName} WHERE userid=$1 ORDER BY created LIMIT 200;`;
    const queryValues = [serverObfuscateData(userID)];
    let result = [];

    try {
      result = await this.client.query(querySelectBlog, queryValues);
    } catch (err) {
      console.error('getBlogUserEntries: error when querying for userID:', err);
    }

    return result;
  }

  // check if a blog entry exists by blogID to give simple boolean respone
  async doesBlogExist(blogID){
    if (this.setupError) {
      console.log(`doesBlogExist: cannot get any blog entry there is a setup error`);
      return false;
    }
    const querySelectBlog = `SELECT id FROM ${this.tableName} WHERE id=$1;`;
    const queryValues = [blogID];
    let result = false;
    try {
      const res = await this.client.query(querySelectBlog, queryValues);
      if ( res.rows.length > 0 ){
        result = true;
      }
    } catch (err) {
      console.error('doesBlogExist: error when querying for blogID:', err);
    }
    return result;
  }

  async getBlog(blogID){
    if (this.setupError) {
      console.log(`getBlog: cannot get any blog entry there is a setup error`);
      return;
    }

    const querySelectBlog = `SELECT * FROM ${this.tableName} WHERE id=$1;`;
    const queryValues = [blogID];
    let result = [];
    try {
      const res = await this.client.query(querySelectBlog, queryValues);
      if ( res.rows.length > 0 ){
        result = res.rows[0];
        //console.log(result);
      }
    } catch (err) {
      console.error('getBlog: error when querying for blogID:', err);
    }

    return result;
  }

  // check if a blog entry exists by title to give simple boolean respone
  //  to allow for creation of linking url to get next / previous blog entry by title
  async doesBlogByTitleExist(blogTitle){
    if (this.setupError) {
      console.log(`doesBlogByTitleExist: cannot get any blog entry there is a setup error`);
      return false;
    }
    const querySelectBlog = `SELECT title FROM ${this.tableName} WHERE title=$1;`;
    const queryValues = [blogTitle];
    let result = false;
    try {
      const res = await this.client.query(querySelectBlog, queryValues);
      if ( res.rows.length > 0 ){
        result = true;
      }
    } catch (err) {
      console.error('doesBlogByTitleExist: error when querying for title:', err);
    }
    return result;
  }

  async getBlogByTitle(blogTitle){
    if (this.setupError) {
      console.log(`getBlogByTitle: cannot get any blog entry there is a setup error`);
      return;
    }

    const querySelectBlog = `SELECT * FROM ${this.tableName} WHERE title=$1;`;
    const queryValues = [blogTitle];
    let result = [];
    try {
      const res = await this.client.query(querySelectBlog, queryValues);
      if ( res.rows.length > 0 ){
        result = res.rows;
        //console.log(result);
      }
    } catch (err) {
      console.error('getBlogByTitle: error when querying for title:', err);
    }

    return result;
  }

  async getMostRecentBlogs(){
    if (this.setupError) {
      console.log(`getMostRecentBlogs: cannot get any blog there is a setup error`);
      return;
    }
    const querySelectBlog = `SELECT * FROM ${this.tableName} ORDER BY created DESC LIMIT 200;`;
    const queryValues = [];

    let result = [];
    try {
      const res = await this.client.query(querySelectBlog, queryValues);
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
      console.log(`deleteBlog: cannot get any blog entry there is a setup error`);
      return;
    }

    // Implement deletion logic here
    const queryDeleteBlog = `DELETE FROM ${this.tableName} WHERE id=$1 AND userid=$2;`;
    const queryValues = [blogID, serverObfuscateData(userData.userId)];
    let result = [];

    try {
      result = await this.client.query(queryDeleteBlog, queryValues);
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

console.log("blog.js module executed");

export default OBlog;

