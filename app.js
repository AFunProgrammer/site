// requirements
import fs from "fs";
import path from "path";

import * as uuid from 'uuid';
import * as entities from 'entities';

//import morgan from 'morgan'; //most common database server postgres or mysql // most people use docker for virtualization

// express
import express from 'express';
import session from 'express-session';

// form control
import bodyParser from 'body-parser';
import formidable from 'formidable';
import multer from 'multer';

// private functions
import { serverEncrypt, serverDecrypt, serverObfuscateData } from './private/code/crypto_utils.js';
import { setSignInInfo } from './signin.js';

// oauth
import axios from 'axios';

// custom JS objects
import OCategories from "./categories.js";
import OMediaDownloader from "./mediadownload.js";
import OBlog from "./blog.js";

////////////////////////////////////////////
// Global Variables:
////////////////////////////////////////////
// ProxyDNS's IP ranges for IPv4 and IPv6 (you can update these regularly)
//const proxyDNSV4IpRanges = [];
//const proxyDNSV6IpRanges = [];

var lastMulterDirectory = "";
var setGamePath = "";
var messages = [];

// import configuration
import {
  settings,
  envFile,
  codeVerifier,
  codeChallenge,
  privateKey,
  certificate,
  credentials,
  proxyDNSV4IpRanges,
  proxyDNSV6IpRanges,
  sessionOptions
} from './config.js';

////////////////////////////////////
// Express Definition
////////////////////////////////////
const app = express();

// Configure multer to use memory storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Set the destination to a private directory
    const privatePath = __dirname + "/private/categories/games";
    let gamePath = privatePath + "/";
    // allow override in order to update previously saved data
    if (setGamePath != "") {
      gamePath = gamePath + setGamePath;
    } else {
      gamePath = gamePath + OCategories.getCurrentGame();
    }

    if (!fs.existsSync(gamePath)) {
      fs.mkdirSync(gamePath);
    }

    // Save the last path that files were saved to
    lastMulterDirectory = gamePath;

    //console.log('current game path: ' + gamePath);
    cb(null, gamePath);
  },
  filename: function (req, file, cb) {
    if (req.session.authenticated) {
      // Use the original file name, or any naming convention you prefer
      cb(null, file.originalname);
    }
  },
});

const upload = multer({ storage: storage });

// create http/s server
import http from 'http';
import https from 'https';
const defunct = http.createServer(app);
const server = https.createServer(credentials, app);

// setup io for websocket communication
import { Server } from 'socket.io';
const io = new Server(server);

// Disable certain behavior
app.disable("x-powered-by");

// Express Setup View Engine
app.set("view engine", "ejs");
// Express Setup Trust Cloudflare as a proxy
app.set("trust proxy", 1); // This enables trust for the first proxy (Cloudflare)

////////////////////////////////////////////////////////
// Processing of Connection and Requests
////////////////////////////////////////////////////////

//session information is vital to everything...
app.use(session(sessionOptions));

//redirect any page from http to https (only works on HTTP port 3000)
app.use((req, res, next) => {
  // const sessionId = req.sessionID;
  // Get the incoming ip address and verify it's in the proxy range
  // const ip = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  // console.log(`Incoming Session ID: ${sessionId} | From IP Address: ${ip}`);

  // Check if the proxy IP is from Cloudflare's range
  // const isCloudflare = ipRangeCheck(ip, proxyDNSV4IpRanges) || ipRangeCheck(ip, proxyDNSV6IpRanges);

  // if (!isCloudflare) {
  // Reject any requests that don't come from Cloudflare
  // return res.status(403).send('Forbidden: Invalid proxy');
  //}

  // If trusted, log the session ID and the real client IP (last in the X-Forwarded-For chain)
  //const realClientIp = req.headers['x-forwarded-for']?.split(',').pop() || req.connection.remoteAddress;
  //console.log(`Incoming Session ID: ${sessionId} | Real Client IP: ${realClientIp} | Proxy IP: ${ip}`);

<<<<<<< Updated upstream
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const isWellKnown = req.url.startsWith('/.well-known/');
=======
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const isWellKnown = req.url.startsWith("/.well-known/");
>>>>>>> Stashed changes

  if (!isSecure && !isWellKnown) {
    const redirectHost = req.headers.host.replace("3000", "3443");
    const redirectUrl = `https://${redirectHost}${req.url}`;
    console.log(`Redirecting to: ${redirectUrl}`);
    return res.redirect(301, redirectUrl);
  }

  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(express.static("public"));

/////////////////////////////////////////////////////////////////
// Server Opens These Ports to Listen
/////////////////////////////////////////////////////////////////

// Express Server Listen
defunct.listen(3000);
server.listen(3443);

////////////////////////////////////////////////////////////////
// Application Routes
////////////////////////////////////////////////////////////////
import oauthRoutes from './routes/oauth.js';
app.use("/", oauthRoutes);


// Request Home Page or Root Path
app.get("/", (req, res) => {
  res.render("index", { ...setSignInInfo(req), title: "Home Page" });
});

// No Access Page
app.get("/noaccess", (req, res) => {
  res.render("noaccess", { ...setSignInInfo(req), title: "No Access" });
});

// Heart
app.get("/lord", (req, res) => {
  res.render("heart", {
    ...setSignInInfo(req),
    title: "Turn Our Hearts To The Lord",
  });
});

// Categories Game List
app.get("/categories", async (req, res) => {
  let gameInfo = [];
  let gameUrl = "";
  let editUrl = "";

  try {
    let gameList = OCategories.getGameList();
    if (gameList.length == 0) {
      gameList.push("None");
    }
    // format the list of games for consumption
    for (gameID of gameList) {
      gameUrl = `/categories/game/:${gameID}`;
      editUrl = "";
      try {
        let createdByInfo = await loadCreatedByInfo(
          OCategories.getGamePath(gameID)
        );

        if (
          createdByInfo &&
          serverDecrypt(createdByInfo["email"]) == req.session.userId
        ) {
          editUrl = `/categories/edit/:${gameID}`;
        }
      } catch (error) {
        console.error(error);
      }

      gameInfo.push({ gameID: gameID, gameUrl: gameUrl, editUrl: editUrl });
    }
  } catch (error) {
    console.error("Error in get /categories:", error);
    return res.status(500).send("Server error occurred");
  }

  //console.log(`/categories sending list: ${formattedGameList.join("/r/n")}`);
  res.render("categorieslist", {
    ...setSignInInfo(req),
    title: "Categories Game List",
    gameData: gameInfo,
  });
});

// Posting a created or editted game
app.post(
  "/categories/gamedata/:gameID",
  validateSessionData,
  updateGamePath,
  upload.any(),
  (req, res) => {
    let gameID = req.params.gameID.replace(":", ""); // set the gameID to a string without the colon...

    let redirectUrl = "/";

    // Add new game to the game list
    try {
      // Save the session information
      saveCreatedByInfo(req, lastMulterDirectory);
      if (gameID == "New") {
        // Iterate the available game ID
        gameID = OCategories.getCurrentGameAndUpdate();
      }
      setGamePath = ""; //!Important - clear override of game path
      // Generate redirect Url from gameID
      redirectUrl = `/categories/game/:${gameID}`;
    } catch (error) {
      console.error(`app.post('/categories/gamedata/:${gameID}`, error);
      return res.status(500).send("Server error occurred");
    }

    res.status(201).json({ redirectUrl });
  }
);

// Playing Actual Categories Game
app.get("/categories/gamedata/:gameID", (req, res) => {
  const gameID = req.params.gameID.replace(":", ""); // set the gameID to a string without the colon...

  try {
    let jsonData = OCategories.getGameDataAsJSON(gameID);
    res.send(jsonData);
  } catch (error) {
    console.error("Error in get /categories/gamedata/:gameID", error);
    return res.status(500).send("Server error occurred");
  }
});

// Create a new Categories Game
app.get("/categories/edit/:gameID", async (req, res) => {
  let editURL = "/categories/gamedata/:New"; // default is to create a new game
  let useTitle = "Create New Categories Game";
  let createdById = "";
  const gameID = req.params.gameID.replace(":", ""); // set the gameID to a string without the colon...

  try {
    if (gameID != "New" && OCategories.gameIDExists(gameID)) {
      try {
        let createdByInfo = await loadCreatedByInfo(
          OCategories.getGamePath(gameID)
        );
        if (createdByInfo) {
          createdById = serverDecrypt(createdByInfo["email"]);
        }
      } catch (error) {
        console.error(error);
      }

      if (createdById == req.session.userId) {
        editURL = `/categories/gamedata/:${gameID}`;
        useTitle = `Edit Categories Game ${gameID}`;
      }
    }
  } catch (error) {
    console.error(error);
  }

  if (req.session.authenticated) {
    return res.render("categoriescreate", {
      ...setSignInInfo(req),
      title: useTitle,
      gameID: gameID,
      dataURL: editURL,
    });
  }

  res.render("noaccess", { ...setSignInInfo(req), title: "No Access" });
});

// Route for dynamic game URLs (http://mysite/game/AAAA, http://mysite/game/BBBB)
app.get("/categories/game/:gameID", async (req, res) => {
  let createdBy = "unknown";
  let gameExists = false;

  const gameID = req.params.gameID.replace(":", ""); // set the gameID to a string without the colon...

  try {
    gameExists = OCategories.gameIDExists(gameID);
  } catch (error) {
    console.error(error);
  }

  // verify the game exists, otherwise send a 404 [TBD but need to
  //  send a page saying gameID doesn't exist]
  if (gameExists == false) {
    return res.status(404).render("404", {
      ...setSignInInfo(req),
      title: "GameID Not Found",
      notFoundMsg: `GameID of "${gameID}" not found<br>Go back and check the /:GameID`,
    });
  }

  try {
    let createdByInfo = await loadCreatedByInfo(
      OCategories.getGamePath(gameID)
    );
    if (createdByInfo) {
      createdBy = serverDecrypt(createdByInfo["name"]);
      //console.log(`GameID: ${gameID} Created By: ${createdBy}`);
      //console.log(`GameID: ${gameID} Email: ${serverDecrypt(createdByInfo['email'])}`);
      //console.log(`GameID: ${gameID} IP: ${serverDecrypt(createdByInfo['ip'])}`);
    }
  } catch (error) {
    console.error(error);
  }

  // Send a success message after serving static files (optional)
  res.render("categoriesplay", {
    ...setSignInInfo(req),
    title: `Categories Game ${gameID}`,
    madeBy: createdBy,
    gameDataURL: `/categories/gamedata/:${gameID}`,
  });
});

////////////////////////////////////////////////////////////////
// Blogs
//  adding blogs to the blogosphere with family focus
//
////////////////////////////////////////////////////////////////

/// Get a list of blogs, send the most recent ones to the page
app.get("/blogs", async (req, res) => {
  let queryResult = undefined;
  let blogList = [];

  try {
    // watch in the future for multiple results
    queryResult = await OBlog.getGlobalInstance().getMostRecentBlogs();
  } catch (error) {
    console.error(error);
    return res.status(500).render("404", {
      ...setSignInInfo(req),
      title: "No Blogs Found",
      notFoundMsg: `Server Error trying to retrieve blogs`,
    });
  }

  if (queryResult.length == 0) {
    return res.status(404).render("404", {
      ...setSignInInfo(req),
      title: "No Blogs Found",
      notFoundMsg: `There are no Blogs to be displayed`,
    });
  }

  // setup blog data for edit / new
  for (row of queryResult) {
    let blog = {
      viewurl: `/blogs/view/:${row.id}`,
      title: row.title,
      username: row.username,
    };

    blogList.push(blog); // add specific blog data to be listed
  }

  res.render("bloglist", {
    ...setSignInInfo(req),
    title: "Recent Blogs",
    blogList: blogList,
  });
});

//// Post request to delete a blog (read somewhere that PUT / DELETE aren't always supported)
app.delete("/blogs/edit/:blogID", async (req, res) => {
  const useBlogId = req.params.blogID.replace(":", ""); // set the date to a string without the colon...
  let redirectUrl = "/blogs";
  let queryResult = {};

  if (
    useBlogId === undefined ||
    !isNumeric(useBlogId) ||
    !req.session.authenticated
  ) {
    return;
  }

  // BlogID entered, does it exist, and is the user authenticated to edit it
  try {
    // watch in the future for multiple results
    queryResult = await OBlog.getGlobalInstance().getBlog(useBlogId);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ redirectUrl });
  }
  // if authenticated login, and is the current user blog edit otherwise make 'New' blog
  if (
    queryResult &&
    queryResult.userid &&
    queryResult.userid == serverObfuscateData(req.session.userId)
  ) {
    const userData = {
      userId: req.session.userId,
      userName: req.session.userName,
    };
    OBlog.getGlobalInstance().deleteBlog(userData, useBlogId);
  } else {
    return res.status(500).json({ redirectUrl });
  }

  res.status(201).json({ redirectUrl });
});

//// Post a new BLOG Entry to the database and redirect
app.post("/blogs/edit/:blogID", async (req, res) => {
  const blogID = req.params.blogID.replace(":", ""); // set the date to a string without the colon...
  let redirectUrl = "/";

  if (req.body === undefined || !req.session.authenticated) {
    return;
  }

  const blogEntry = new formidable.IncomingForm();

  blogEntry.parse(req, async (err, fields, files) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error Parsing Blog Entry");
    }

    //console.log('Fields:', fields);
    //console.log('Files:', files);
    // Add a new blog entry in to the database
    try {
      let blogData = {
        id: blogID, // Use this to determine if new or update
        title: fields.title[0],
        content: fields.content[0], // this is html formatted data with 'extra data'
        backcolor: fields.backcolor[0],
        imagename: fields.imagename[0],
        fillstyle: fields.fillstyle[0],
        opacity: fields.opacity[0],
      };

      const userData = {
        username: req.session.userName,
        userid: req.session.userId,
      };

      const addedBlogId = await OBlog.getGlobalInstance().updateBlog(
        userData,
        blogData
      );
      redirectUrl = `/blogs/view/:${addedBlogId}`;
    } catch (error) {
      console.error(`app.post('/blogs/edit/:${blogID}`, error);
      return res
        .status(500)
        .send("Server error occurred while processing blog data");
    }

    res.status(201).json({ redirectUrl });
  });
});

//// Create or edit a blog entry
app.get("/blogs/edit/:blogId", async (req, res) => {
  let useTitle = "Enter New Blog";
  let useBlogData = {};
  let useBlogId = req.params.blogId.replace(":", ""); // set the date to a string without the colon...
  let queryResult = undefined;

  // if a "New" blog then go down the path of just entering a blog
  if (!req.session.authenticated) {
    return res.render("noaccess", {
      ...setSignInInfo(req),
      title: "Need to sign-in",
    });
  }

  // setup blog data for edit / new
  useBlogData.id = "New";
  useBlogData.title = "";
  useBlogData.content = "";
  useBlogData.username = req.session.userName;
  useBlogData.backColor = "#ffffff";
  useBlogData.imageName = "";
  useBlogData.fillStyle = "contain";
  useBlogData.opacity = 1;

  // Check to see if a specific blogId was entered
  if (useBlogId != "" && isNumeric(useBlogId)) {
    // BlogID entered, does it exist, and is the user authenticated to edit it
    try {
      // watch in the future for multiple results
      queryResult = await OBlog.getGlobalInstance().getBlog(useBlogId);
    } catch (error) {
      console.error(error);
    }

    // if authenticated login, and is the current user blog edit otherwise make 'New' blog
    if (
      queryResult &&
      queryResult.userid == serverObfuscateData(req.session.userId)
    ) {
      useTitle = `Edit Blog ${useBlogId}`;

      useBlogData.id = queryResult.id;
      useBlogData.title = queryResult.title;
      useBlogData.content = queryResult.content;
      useBlogData.username = req.session.userName;
      useBlogData.backColor = queryResult.backcolor;
      useBlogData.imageName = queryResult.imagename;
      useBlogData.fillStyle = queryResult.fillstyle;
      useBlogData.opacity = queryResult.opacity;
    } else {
      useBlogId = "New";
    }
  } else {
    useBlogId = "New"; //set to new entry because misconfigured
  }

  const backImages = enumerateImagesIn("./public/images/blog/backgrounds");
  let useEditUrl = `/blogs/edit/:${useBlogData.id}`;

  res.render("blogentry", {
    ...setSignInInfo(req),
    title: useTitle,
    editUrl: useEditUrl,
    blogData: useBlogData,
    blogBackImage: backImages,
  });
  return;
});

/// View a blog
app.get("/blogs/view/:blogId", async (req, res) => {
  let useBlogId = req.params.blogId.replace(":", ""); // set the date to a string without the colon...
  let useBlogData = {};
  let queryResult = undefined;

  try {
    // watch in the future for multiple results
    queryResult = await OBlog.getGlobalInstance().getBlog(useBlogId);
  } catch (error) {
    console.error(error);
  }

  if (queryResult.length == 0) {
    return res.status(404).render("404", {
      ...setSignInInfo(req),
      title: "BlogID Not Found",
      notFoundMsg: `BlogID of "${useBlogId}" not found<br>Go back and check the /:BlogID`,
    });
  }

  // setup blog data for edit / new
  useBlogData.id = queryResult.id;
  useBlogData.title = queryResult.title;
  useBlogData.content = queryResult.content;
  useBlogData.username = queryResult.username;
  useBlogData.backColor = queryResult.backcolor;
  useBlogData.imageName = queryResult.imagename;
  useBlogData.fillStyle = queryResult.fillstyle;
  useBlogData.opacity = queryResult.opacity;

  useBlogData.previousEntry = "";
  useBlogData.nextEntry = "";

  let ownerShow = "d-none";
  let editUrl = "";

  // if authenticated login, and is the current user blog then allow edit to be listed
  if (req.session.authenticated) {
    if (
      queryResult.userid == serverObfuscateData(req.session.userId) &&
      queryResult.username == req.session.userName
    ) {
      //enable edit
      ownerShow = "";
      editUrl = `/blogs/edit/:${useBlogId}`;
    }
  }

  res.render("blogview", {
    ...setSignInInfo(req),
    title: useBlogData.title,
    blogData: useBlogData,
    blogOwnerShow: ownerShow,
    blogEditUrl: editUrl,
    blogViewUrl: `/blogs/view/:`,
  });
});

//////////////////////////////////////////////////////////////
// Daily Scripture -
//  Usage of a 'focused' Blog on Christian Scripture
//////////////////////////////////////////////////////////////

//// Post request to delete a blog (read somewhere that PUT / DELETE aren't always supported)
app.delete("/dailyscripture/edit/:date", async (req, res) => {
  let useDate = req.params.date.replace(":", ""); // set the date to a string without the colon...
  let redirectUrl = "/dailyscripture/view/:Today";
  let queryResult = {};

  if (
    useDate === undefined ||
    isNaN(Date.parse(useDate)) ||
    !req.session.authenticated
  ) {
    return;
  }

  // BlogID entered, does it exist, and is the user authenticated to edit it
  try {
    // watch in the future for multiple results
    queryResult = await OBlog.getGlobalInstance("scripture").getBlogByTitle(
      useDate
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ redirectUrl });
  }
  // if authenticated login, and is the current user blog edit otherwise make 'New' blog
  if (queryResult) {
    for (result of queryResult) {
      if (
        result.userid &&
        result.userid == serverObfuscateData(req.session.userId)
      ) {
        const userData = {
          userId: req.session.userId,
          userName: req.session.userName,
        };
        OBlog.getGlobalInstance("scripture").deleteBlog(userData, result.id);
      } else {
        return res.status(500).json({ redirectUrl });
      }
    }
  }

  res.status(201).json({ redirectUrl });
});

//// Post a new BLOG Entry to the database and redirect
app.post("/dailyscripture/edit/:date", async (req, res) => {
  const addToMonth = new Date("01-01-01").getMonth() == 0 ? 1 : 0; // Why in the heck use 0 based Month?
  const useDate = req.params.date.replace(":", ""); // set the date to a string without the colon...
  let useBlogId = "New";
  let useDateTitle = "";
  let redirectUrl = "/dailyscripture/view/:Today";

  if (req.body === undefined || !req.session.authenticated) {
    return;
  }

  const blogEntry = new formidable.IncomingForm();

  blogEntry.parse(req, async (err, fields, files) => {
    if (isNaN(Date.parse(`${fields.title[0]}`)) || err) {
      if (isNaN(Date.parse(fields.title[0]))) {
        console.error(
          `Invalid Date Detected: ${
            fields.title[0]
          } Output from Parse: ${Date.parse(fields.title[0]).toString()}`
        );
      } else {
        console.error(err);
      }
      return res.status(500).send("Error Parsing Daily Scripture Entry");
    }

    // Add a new blog entry in to the database
    try {
      let blogDate = new Date(Date.parse(fields.title[0])); //given date
      let blogDateTitle = `${
        blogDate.getMonth() + addToMonth
      }-${blogDate.getDate()}-${blogDate.getFullYear()}`;
      useDateTitle = blogDateTitle;

      // Check to see if an entry exists for this date already
      try {
        // watch in the future for multiple results
        let queryResult = await OBlog.getGlobalInstance(
          "scripture"
        ).getBlogByTitle(useDate);
        if (queryResult && queryResult.length > 0) {
          useBlogId = queryResult[0].id;
        }
      } catch (error) {
        console.error(error);
      }

      let blogData = {
        id: useBlogId, // Use this to determine if new or update
        title: blogDateTitle, //ensure this is correctly formatted
        content: fields.content[0], // this is html formatted data with 'extra data'
        backcolor: fields.backcolor[0],
        imagename: fields.imagename[0],
        fillstyle: fields.fillstyle[0],
        opacity: fields.opacity[0],
      };

      const userData = {
        username: req.session.userName,
        userid: req.session.userId,
      };

      await OBlog.getGlobalInstance("scripture").updateBlog(userData, blogData);
      redirectUrl = `/dailyscripture/view/:${useDateTitle}`;
    } catch (error) {
      console.error(`app.post('/dailyscripture/edit/:${useDateTitle}`, error);
      return res
        .status(500)
        .send("Server error occurred while processing daily scripture data");
    }

    res.status(201).json({ redirectUrl });
  });
});

//// Create or edit daily scripture entry...
app.get("/dailyscripture/edit/:date", async (req, res) => {
  const addToMonth = new Date("01-01-01").getMonth() == 0 ? 1 : 0; // Why in the heck use 0 based Month?
  const dateToday = new Date(Date.now());
  const useDateToday = `${
    dateToday.getMonth() + addToMonth
  }-${dateToday.getDate()}-${dateToday.getFullYear()}`;

  let useTitle = "Edit Daily Scripture";
  let useDate = req.params.date.replace(":", ""); // set the date to a string without the colon...
  let useBlogData = {};
  let queryResult = undefined;

  if (
    !req.session.authenticated ||
    req.session.userId != settings.scripture.email
  ) {
    return res.render("noaccess", {
      ...setSignInInfo(req),
      title: "Only The Site Administrator Is Allowed To Do This",
    });
  }

  // check for doing today only
  if (useDate == "Today" || isNaN(Date.parse(useDate))) {
    useDate = useDateToday;
  } else {
    // parse the date to something useable
    const dateGiven = new Date(Date.parse(useDate));
    useDate = `${
      dateGiven.getMonth() + addToMonth
    }-${dateGiven.getDate()}-${dateGiven.getFullYear()}`;
  }

  // setup blog data for edit / new
  useBlogData.id = "New";
  useBlogData.title = useDate;
  useBlogData.content = "";
  useBlogData.username = req.session.userName;
  useBlogData.backColor = "#ffffff";
  useBlogData.imageName = "";
  useBlogData.fillStyle = "contain";
  useBlogData.opacity = 1;

  // Check to see if an entry exists for this date already
  try {
    // watch in the future for multiple results
    queryResult = await OBlog.getGlobalInstance("scripture").getBlogByTitle(
      useDate
    );
  } catch (error) {
    console.error(error);
  }

  // if authenticated login, and is the current user blog edit otherwise make 'New' blog
  if (queryResult && queryResult[0]) {
    useTitle = `Edit Scripture For Date ${useDate}`;

    useBlogData.id = queryResult[0].id;
    useBlogData.title = queryResult[0].title;
    useBlogData.content = queryResult[0].content;
    useBlogData.username = req.session.userName;
    useBlogData.backColor = queryResult[0].backcolor;
    useBlogData.imageName = queryResult[0].imagename;
    useBlogData.fillStyle = queryResult[0].fillstyle;
    useBlogData.opacity = queryResult[0].opacity;
  }

  const backImages = enumerateImagesIn("./public/images/blog/backgrounds");

  // remember that the blogs posted / deleted via the ID, use the date to find
  let useEditUrl = `/dailyscripture/edit/:${useDate}`;

  res.render("blogentry", {
    ...setSignInInfo(req),
    title: useTitle,
    editUrl: useEditUrl,
    blogData: useBlogData,
    blogBackImage: backImages,
  });
});

//// View a daily scripture entry
app.get("/dailyscripture/view/:date", async (req, res) => {
  const addToMonth = new Date("01-01-01").getMonth() == 0 ? 1 : 0; // Why in the heck use 0 based Month?
  const dateToday = new Date(Date.now());
  const useDateToday = `${
    dateToday.getMonth() + addToMonth
  }-${dateToday.getDate()}-${dateToday.getFullYear()}`;

  let useDate = req.params.date.replace(":", ""); // set the date to a string without the colon...
  let useBlogData = {};
  let queryResult = undefined;

  // check for doing today only
  if (useDate == "Today" || isNaN(Date.parse(useDate))) {
    useDate = useDateToday;
  } else {
    // parse the date to something useable
    const dateGiven = new Date(Date.parse(useDate));
    useDate = `${
      dateGiven.getMonth() + addToMonth
    }-${dateGiven.getDate()}-${dateGiven.getFullYear()}`;
  }

  // Check to see if an entry exists for this date
  try {
    // watch in the future for multiple results
    queryResult = await OBlog.getGlobalInstance("scripture").getBlogByTitle(
      useDate
    );
  } catch (error) {
    console.error(error);
  }

  if (queryResult.length == 0) {
    return res.status(404).render("404", {
      ...setSignInInfo(req),
      title: "Daily Scripture Entry Not Found",
      notFoundMsg: `Date of "${useDate}" not found<br>Go back and check the /:Date`,
    });
  }

  // Get previous and next dates for viewing those scripture blog entries
  try {
    let previousDate = new Date(Date.parse(useDate));
    let nextDate = new Date(Date.parse(useDate));
    for (let i = 1; i < 10; i++) {
      // check out for one 10 days in either direction
      if (useBlogData.previousEntry === undefined) {
        previousDate.setDate(previousDate.getDate() - i);
        let previousDateBlogTitle = `${
          previousDate.getMonth() + addToMonth
        }-${previousDate.getDate()}-${previousDate.getFullYear()}`;
        let prevResult = await OBlog.getGlobalInstance(
          "scripture"
        ).doesBlogByTitleExist(previousDateBlogTitle);
        if (prevResult) {
          useBlogData.previousEntry = previousDateBlogTitle;
        }
      }
      if (useBlogData.nextEntry === undefined) {
        nextDate.setDate(nextDate.getDate() + i);
        let nextDateBlogTitle = `${
          nextDate.getMonth() + addToMonth
        }-${nextDate.getDate()}-${nextDate.getFullYear()}`;
        let nextResult = await OBlog.getGlobalInstance(
          "scripture"
        ).doesBlogByTitleExist(nextDateBlogTitle);
        if (nextResult) {
          useBlogData.nextEntry = nextDateBlogTitle;
        }
      }
    }
  } catch (error) {
    console.error(error);
  }

  // setup blog data for edit / new
  useBlogData.id = queryResult[0].id;
  useBlogData.title = queryResult[0].title;
  useBlogData.content = queryResult[0].content;
  useBlogData.username = queryResult[0].username;
  useBlogData.backColor = queryResult[0].backcolor;
  useBlogData.imageName = queryResult[0].imagename;
  useBlogData.fillStyle = queryResult[0].fillstyle;
  useBlogData.opacity = queryResult[0].opacity;

  useBlogData.previousEntry = useBlogData.previousEntry || ""; // default to an empty string
  useBlogData.nextEntry = useBlogData.nextEntry || ""; // default to an empty string

  let ownerShow = "d-none";
  let editUrl = "";

  // if authenticated login, and is the current user blog then allow edit to be listed
  if (req.session.authenticated) {
    if (
      queryResult[0].userid == serverObfuscateData(req.session.userId) &&
      queryResult[0].username == req.session.userName
    ) {
      //enable edit
      ownerShow = "";
      editUrl = `/dailyscripture/edit/:${useDate}`;
    }
  }

  res.render("blogview", {
    ...setSignInInfo(req),
    title: useBlogData.title,
    blogData: useBlogData,
    blogOwnerShow: ownerShow,
    blogEditUrl: editUrl,
    blogViewUrl: `/dailyscripture/view/:`,
  });
});

///////////////////////////////////////////////////////////
// Parsing Query Strings
///////////////////////////////////////////////////////////
app.get("/test/querystring", async (req, res) => {
  const urlQuery = req.query;
  if (urlQuery === undefined || Object.keys(urlQuery).length === 0) {
    console.log(`/test/querystring: url: ${req.originalUrl} no query string`);
    return res.status(500).json({ redirectUrl: "https://localhost:3443/" });
  }
  const urlQueryString = req.originalUrl;

  console.log(
    `/test/querystring: parsing url: ${req.originalUrl} query: ${urlQueryString}`
  );
  console.log(urlQuery);
  console.log(`/test/querystring: done parsing...`);

  res
    .status(201)
    .json({ redirectUrl: "https://localhost:3443/", queryResult: urlQuery });
});

///////////////////////////////////////////////////////////
// Media and Video
///////////////////////////////////////////////////////////
// Play a video
app.get("/video/play/:videoID", async (req, res) => {
  const videoID = req.params.videoID.replace(":", ""); // set the videoID to a string without the colon...
  let pageTitle = `Play Video: ${videoID}`;
  let videoFilePath = path.normalize(
    path.join(__dirname, `public/videos/${videoID}`)
  );
  let htmlVideoPath = `/videos/${videoID}`;

  //if ( !req.session.authenticated ) {
  //  return res.render('noaccess', {...setSignInInfo(req), title: 'Cannot Watch This' });
  //}

  try {
    if (fs.existsSync(videoFilePath)) {
      return res.render("vidplay", {
        ...setSignInInfo(req),
        title: pageTitle,
        videoName: videoID,
        videoPath: htmlVideoPath,
      });
    }
  } catch (error) {
    console.error(error);
  }

  return res.render("vidplay", {
    ...setSignInInfo(req),
    title: `Video ${videoID} Doesn't Exist Watching: default.mp4`,
    videoName: "default.mp4",
    videoPath: "/videos/default.mp4",
  });
});

// Setup to download an internet video
app.get("/video/download", async (req, res) => {
  return res.render("viddownload", {
    ...setSignInInfo(req),
    title: `Video Download`,
  });
});

// Download an internet video
app.post("/video/download/request", upload.none(), async (req, res) => {
  let downloadUrl = req.body.videoFromUrl ? req.body.videoFromUrl : ""; // get the URL where the video is

  console.log(`app.post: /video/download/:url: received URL: ${downloadUrl}`);
  OMediaDownloader.getMediaInfo(downloadUrl);
  OMediaDownloader.getMedia(downloadUrl);

  res.status(201).json({ downloadUrl });
});

///////////////////////////////////////////////////////////
// Chat Application
///////////////////////////////////////////////////////////
// Retrieve View and Any Stored Messages
app.get("/chat", (req, res) => {
  let userName = "Anonymous";
  if (req.session.userId) {
    userName = req.session.userName;
  }
  previousMsgs = messages.join("\r\n");
  if (previousMsgs.trim() != "") {
    previousMsgs += "\r\n";
  }
  res.render("chat", {
    ...setSignInInfo(req),
    title: "Chat",
    previousMessages: previousMsgs,
    userName: userName,
  });
});

// Return to accept Dynamic Message
app.get("/chat/messages", (req, res) => {
  res.send("Success"); //200,201
});

// Dynamic Chat Message
app.post("/chat/messages", (req, res) => {
  if (req.body == null) {
    return;
  }
  const stringed = JSON.stringify(req.body, null, 2);
  console.log("Received New Message: " + stringed);
  let message = "";
  let user = "";
  let bSent = false;

  const items = JSON.parse(stringed, (key, value) => {
    if (key == "user") {
      user = value;
      //console.log('Found Chat User: ' + user);
    }
    if (key == "chat") {
      message = value;
      //console.log('Found Chat Message: ' + message);
    }

    if (!bSent && user.trim() != "" && message.trim() != "") {
      var datetime = new Date();
      msg = datetime.toLocaleTimeString() + ": " + `${user}: ${message}`;

      //console.log(`Sending Chat Message: ${msg}`);
      io.emit("message", msg);
      messages.push(msg);
      //return;
      bSent = true;
    }
  });
});

///////////////////////////////////////////////////////////
//
// Receiving Game Input Data:
//
///////////////////////////////////////////////////////////
app.post("/gamedata/getuniqueid/:gameType", upload.none(), async (req, res) => {
  let gameType = req.params.gameType.replace(":", ""); // set the gameType to a string without the colon...

  console.log(`received gametype: ${gameType}`);

  let uniqueID = uuid.v4();
  res.status(201).json({ uniqueID });
});

app.post("/gamedata/:gameid", upload.none(), async (req, res) => {
  let gameType = req.params.gameType.replace(":", ""); // set the gameType to a string without the colon...

  if (req.body == null) {
    return;
  }
  const stringed = JSON.stringify(req.body, null, 2);
  console.log(`Received Game Data For: ${gameType}`);

  // decipher data from the req body
  const items = JSON.parse(stringed, (key, value) => {
    if (key == "user") {
      user = value;
      //console.log('Found Chat User: ' + user);
    }
    if (key == "chat") {
      message = value;
      //console.log('Found Chat Message: ' + message);
    }
  });
  res.status(201);
});

///////////////////////////////////////////////////////////
// Serving Well-Known Identity File(s)
///////////////////////////////////////////////////////////
// Serve only the identity file from .well-known
app.get("/.well-known/microsoft-identity-association.json", (req, res) => {
  const filePath = path.join(
    __dirname,
    "public",
    ".well-known",
    "microsoft-identity-association.json"
  );
  console.log("Resolved file path:", filePath);
  res.type("application/json");
  res.sendFile(
    "microsoft-identity-association.json",
    {
      root: path.join(__dirname, "public", ".well-known"),
      headers: { "Content-Type": "application/json" },
    },
    (err) => {
      if (err) {
        console.error("SendFile error:", err);
        res.status(err.statusCode || 500).send("File delivery failed");
      } else {
        console.log("File successfully sent");
      }
    }
  );
});

///////////////////////////////////////////////////////////
// Serving Well-Known Identity File(s)
///////////////////////////////////////////////////////////
// Serve only the identity file from .well-known
app.get('/.well-known/microsoft-identity-association.json', (req, res) => {
  const filePath = path.join(__dirname, 'public', '.well-known', 'microsoft-identity-association.json');
  console.log("Resolved file path:", filePath);
  res.type('application/json');
  res.sendFile('microsoft-identity-association.json', {
    root: path.join(__dirname, 'public', '.well-known'),
    headers: { 'Content-Type': 'application/json' }
  }, (err) => {
    if (err) {
      console.error("SendFile error:", err);
      res.status(err.statusCode || 500).send('File delivery failed');
    } else {
      console.log("File successfully sent");
    }
  });
});


///////////////////////////////////////////////////////////
// Error Handling
///////////////////////////////////////////////////////////
app.use((error, req, res, next) => {
  console.log(`received error: ${error}`);
  console.log("This is the rejected field ->", error.field);
  console.log("---------------- Request Body -------------------");
  console.log(req.body);
  console.log("------------ End of Request Body ----------------");
});

////////////////////////////////////////////////////////////////////////
// Middleware Functions - i.e. "not found"
////////////////////////////////////////////////////////////////////////
app.use((req, res) => {
  res.status(404).render("404", {
    ...setSignInInfo(req),
    title: "Site Not Found",
    notFoundMsg: "404 - URL not found on server",
  });
});

////////////////////////////////////////////////////////////////////////
// Defined Functions To Be Used In The
// Processing of the Path Data for the URLS
////////////////////////////////////////////////////////////////////////
function isNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return (
    !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
    !isNaN(parseFloat(str))
  ); // ...and ensure strings of whitespace fail
}

// get all the images from a path
function enumerateImagesIn(relativePath) {
  const files = fs.readdirSync(relativePath);

  const fileData = files.map((file) => {
    const fileName = path.basename(file);
    const nameWithoutExtension = path.parse(file).name;

    return {
      fileName: fileName,
      name: nameWithoutExtension,
    };
  });

  return fileData;
}

/**
 * @param req express http request
 * @returns true if the http request is secure (comes form https)
 */
function isSecure(req) {
  if (req.headers["x-forwarded-proto"]) {
    return req.headers["x-forwarded-proto"] === "https";
  }
  return req.secure;
}

///////////////////////////////////////////////////////////
// Functions for Encrypting User Information and
//  retrieving it for use in the application
///////////////////////////////////////////////////////////
/**
 * Submits user creation information and saves it as a blob.
 * @param {Object} req - The request object containing session and IP information.
 */
function getEncryptedSessionInfo(req) {
  let submittedByJSON = null;

  try {
    // Check if session and user information are available
    if (!req.session.userId || !req.session.userName) {
      console.error(
        "getEncryptedSessionInfo: Session or user information is missing"
      );
      return;
    }

    // Create the user information JSON
    submittedByJSON = {
      email: serverEncrypt(req.session.userId),
      name: serverEncrypt(req.session.userName),
      ip: serverEncrypt(req.ip),
    };
  } catch (error) {
    console.error("getEncryptedSessionInfo: An error occurred:", error);
    throw error;
  }

  return submittedByJSON;
}

/**
 * Loads the createdBy file and converts it to a JSON object.
 * @param {string} filePathName - The file path where the blob is saved.
 * @returns {Promise<Object>} - A promise that resolves to the JSON object.
 */
function loadCreatedByInfo(filePath) {
  let createdByJSON = null;
  const fileName = path.normalize(`${filePath}/createdby.txt`);

  if (fs.existsSync(fileName) == false) {
    //console.log(`loadCreatedByInfo: file does not exist: ${fileName}`);
    return createdByJSON;
  }

  try {
    const createdByBlob = fs.readFileSync(fileName, "utf-8");
    createdByJSON = JSON.parse(createdByBlob.toString("utf-8"));
  } catch (error) {
    console.error(
      `loadCreatedByInfo: Error loading or parsing createdBy file: ${fileName}`,
      error
    );
  }

  return createdByJSON;
}

/**
 * Submits user creation information and saves it as a blob.
 * @param {Object} req - The request object containing session and IP information.
 * @param {string} filePathName - The file path where the blob should be saved.
 */
function saveCreatedByInfo(req, filePath) {
  const fileName = path.normalize(filePath + "/createdby.txt");

  try {
    createdByJson = getEncryptedSessionInfo(req);

    // Convert the JSON to a buffer
    const createdByBlob = Buffer.from(JSON.stringify(createdByJson));

    // Ensure the directory exists
    const dir = path.dirname(fileName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the buffer to the specified file
    fs.writeFile(fileName, createdByBlob, (err) => {
      if (err) {
        console.error("saveCreatedByInfo: Error saving submittedByBlob:", err);
      } else {
        //console.log('saveCreatedByInfo: submittedByBlob saved successfully to: ', fileName);
      }
    });
  } catch (error) {
    console.error("saveCreatedByInfo: An error occurred:", error);
  }
}

///////////////////////////////////////////////////////////
// Validating and Processing of Categories Game Data
///////////////////////////////////////////////////////////
// validate categories game session data
async function validateSessionData(req, res, next) {
  const gameID = req.params.gameID.replace(":", "");

  if (!req.session.authenticated) {
    return res.status(401).send("Access denied. Please sign in first.");
  }

  try {
    if (gameID != "New") {
      // Need to validate that the session also controls
      //  the updating of the game data (if the data exists)
      let createdByInfo = await loadCreatedByInfo(
        OCategories.getGamePath(gameID)
      );
      if (createdByInfo) {
        if (req.session.userId != serverDecrypt(createdByInfo["email"])) {
          return res
            .status(401)
            .send("Access denied. You are not the creator of this Game");
        }
      }
    }
  } catch (error) {
    console.error(`validateSessionData:`, error);
    return res.status(500).send("Server Error"); // Send error response
  }

  next();
}

// Change file save path depending on whether an update or new game
async function updateGamePath(req, res, next) {
  const gameID = req.params.gameID.replace(":", "");

  // clear the parameter
  setGamePath = "";

  // check to validate data actually came before further processing of the directory
  if (req.body == null) {
    console.log(`updateGamePath: Received No FormData`);
    return res
      .status(401)
      .send("Access denied. You are not the creator of this Game");
  }

  // if not a new game then do some extra processing
  if (gameID != "New") {
    setGamePath = gameID;

    try {
      // get the gamePath that should exist
      const gamePath = OCategories.getGamePath(gameID);
      // get the list of files from the directory
      const files = fs.readdirSync(gamePath);
      // clear the directory of any data before processing
      files.forEach((file) => {
        const filePath = path.join(gamePath, file);
        fs.rmSync(filePath);
        //console.log(`Removed file: ${filePath}`);
      });
    } catch (error) {
      console.error(`updateGamePath:`, error);
      return res.status(500).send("Server Error"); // Send error response
    }
  }

  next();
}

const updateProxyDnsIpRange = async () => {
  try {
    // Fetch Cloudflare IPv4 ranges
    const { data } = await axios.get("https://www.cloudflare.com/ips-v4");
    const v4Data = entities.decodeHTML(data);
    v4Data.split("\n").forEach((value) => {
      proxyDNSV4IpRanges.push(value);
    });
    fs.writeFileSync("./private/settings/cloudflare-ips-v4.log", v4Data); // Save the data to a file if needed

    // Fetch Cloudflare IPv6 ranges
    const { data: dataV6 } = await axios.get(
      "https://www.cloudflare.com/ips-v6"
    );
    const v6Data = entities.decodeHTML(dataV6);
    v6Data.split("\n").forEach((value) => {
      proxyDNSV6IpRanges.push(value);
    });
    fs.writeFileSync("./private/settings/cloudflare-ips-v6.log", v6Data); // Save the data to a file if needed

    console.log("Proxy DNS IP ranges updated successfully.");

    // Dynamically set the updated Cloudflare IP ranges in `trust proxy`
    const updatedRanges = [...proxyDNSV4IpRanges, ...proxyDNSV6IpRanges];
    app.set("trust proxy", updatedRanges.join(", ")); // Set it as a comma-separated string

    console.log("Trust proxy updated with Cloudflare IP ranges.");
  } catch (err) {
    console.error("Failed to update Proxy DNS IPs:", err);
  }
};

////////////////////////////////////////////////////
// anything that needs to run at startup
////////////////////////////////////////////////////
OCategories.getCurrentGame();
OBlog.getGlobalInstance();

console.log("Global: Code Verifier:", codeVerifier);
console.log("Global: Code Challenge:", codeChallenge);

// Call it periodically (e.g., once a day)
updateProxyDnsIpRange();
setInterval(updateProxyDnsIpRange, 24 * 60 * 60 * 1000); // 24 hours interval
