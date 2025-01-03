// requirements
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const uuid = require('uuid');
const url = require('url');

//const morgan = require('morgan'); //most common database server postgres or mysql // most people use docker for virtualization

// express
const express = require('express');
const session = require('express-session');
const store = new session.MemoryStore();

// form control
const bodyParser = require('body-parser');
const formidable = require('formidable');
const multer = require('multer');

// private functions
const { serverEncrypt, serverDecrypt } = require('./private/code/crypto_utils.js');

// oauth
const { google } = require('googleapis');
const { OAuth2Client, CodeChallengeMethod } = require('google-auth-library');
const msal = require('@azure/msal-node');
const graph = require('@microsoft/microsoft-graph-client');
const axios = require('axios');

// custom JS objects
const OCategories = require('./categories.js');
const OMediaDownloader = require('./mediadownload.js');

////////////////////////////////////////////
// Global Variables:
////////////////////////////////////////////
var lastMulterDirectory = '';
var setGamePath = "";
var messages = [];
const secretsFile = require('./private/settings/secrets.json');
// DEV - LocalHost
const envFile = require('./private/settings/local.json');
// PROD - WebSite
//const envFile = require('./private/settings/website.json');

var sessionOptions = {
  cookie: {
    secure: true, // Set to true if using HTTPS
    httpOnly: true, // Prevent client-side access
    sameSite: 'lax', // or 'strict'    
  },
  resave: false,
  saveUninitialized: true,
  secret: secretsFile.secrets.session,
  store
};

const codeVerifier = uuid.v1() + crypto.randomBytes(32).toString('hex');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('hex');

const redirectServer = envFile.useRedirect;
var privateKey  = fs.readFileSync(envFile.privateKeyFile, 'utf8');
var certificate = fs.readFileSync(envFile.certificateFile, 'utf8');

////////////////////////////////////////////////////////////
// Credentials / OAuth
////////////////////////////////////////////////////////////
var credentials = {key: privateKey, cert: certificate};

////////////////////////////////////////////////////////////
// OAuth Client Configuration and Objects
////////////////////////////////////////////////////////////
const gglAuthKeys = require(envFile.gglAuthKeysFile);
const msftAuthKeys = require(envFile.msftAuthKeysFile);
const yhooAuthKeys = require(envFile.yhooAuthKeysFile);


const gglWebAuth = new OAuth2Client(
  gglAuthKeys.web.client_id,
  gglAuthKeys.web.client_secret,
  gglAuthKeys.web.redirect_uris[0]
);

const msWebAuthConfig = {
  auth: {
    clientId: msftAuthKeys.web.client_id, // Your Application (client) ID
    authority: msftAuthKeys.web.authority,
    clientSecret: msftAuthKeys.web.client_secret,
    codeChallenge: codeChallenge,
    codeChallengeMethod: 'S256',
    knownAuthorities: msftAuthKeys.web.known_authorities,
    cloudDiscoveryMetadata: "",
    redirectUri: `https://${redirectServer}/oauth/microsoft`, // Redirect URI for security tokens
    postLogoutRedirectUri: `https://${redirectServer}`, // Redirect after logout
  },
  scopes: ['openid', 'profile', 'email'], // Include desired scopes
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
          console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: msal.LogLevel.Error,
    },
    proxyUrl: "",
    customAgentOptions: {},
  },
};

const msCryptoProvider = new msal.CryptoProvider();
const msWebAuth = new msal.ConfidentialClientApplication(msWebAuthConfig, msCryptoProvider);

////////////////////////////////////
// Express Definition
////////////////////////////////////
const app = express();

// Configure multer to use memory storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Set the destination to a private directory
    const privatePath = __dirname + '/private/categories/games';
    let gamePath = privatePath + '/';
    // allow override in order to update previously saved data
    if ( setGamePath != "" ){
      gamePath = gamePath + setGamePath;
    } else {
      gamePath = gamePath + OCategories.getCurrentGame();
    }
    
    if (!fs.existsSync(gamePath)){
      fs.mkdirSync(gamePath);
    }
    
    // Save the last path that files were saved to    
    lastMulterDirectory = gamePath;

    //console.log('current game path: ' + gamePath);
    cb(null, gamePath);
  },
  filename: function (req, file, cb) {
    if ( req.session.authenticated ){
      // Use the original file name, or any naming convention you prefer
      cb(null, file.originalname);
    }
  }
});

const upload = multer({storage: storage});

// create http/s server
const http = require('http');
const https = require('https');
const defunct = http.createServer(app);
const server = https.createServer(credentials, app);

// setup io for websocket communication
const { Server } = require("socket.io");
const io = new Server(server);

// Disable certain behavior
app.disable('x-powered-by')

// Express Setup
app.set('view engine', 'ejs');


////////////////////////////////////////////////////////
// Processing of Connection and Requests
////////////////////////////////////////////////////////

//session information is vital to everything...
app.use( session(sessionOptions) );

//redirect any page from http to https (only works on HTTP port 3000)
app.use((req, res, next) => {
  if ( !isSecure(req) && req.url.search("well-known") <= 0) { 
    const redirectHost = req.headers.host.replace("3000","3443");
    const redirectUrl = `https://${redirectHost}${req.url}`;
    console.log(`redirecting to: ${redirectUrl}`);
    res.redirect(301, redirectUrl);
  } else {
    next();
  }
});

app.use( bodyParser.json() );
app.use( bodyParser.urlencoded({extended: false}) );

app.use( express.static('public') );

/////////////////////////////////////////////////////////////////
// Server Opens These Ports to Listen
/////////////////////////////////////////////////////////////////

// Express Server Listen
defunct.listen(3000);
server.listen(3443);

/////////////////////////////////////////////////////////////
// Basic Sign-In/Out URL / Redirects
/////////////////////////////////////////////////////////////
app.post('/signin/lastpath', (req, res) => {
  if ( req.body == null ){
    console.error("/signin/lastpath: null")
    res.sendStatus(418); //Little Teapot
    return;
  }

  try {
    req.session.lastPath = req.body['path'];
    //console.log(`/signin/lastpath: received path of ${req.body['path']}`);
  } catch( error ) {
    console.error(`/signin/lastpath: error: ${error}`);
    res.sendStatus(400)
    return;
  }

  res.sendStatus(202);
});

app.get('/signin', async (req, res) => {
  res.render('signin', {...setSignInInfo(req), title: 'Sign-In to Website' });
});

app.get('/signout', async (req, res) => {
  signedOut(req);
  res.redirect(`https://${redirectServer}`);
});

/////////////////////////////////////////////////////////////////////
// Allow 'forced' logout from ID authorities
/////////////////////////////////////////////////////////////////////
/** Google */
app.get('/logout/google', async (req, res) => {
  console.log(`/logout/google: received logout request: ${req.body}`);
  res.redirect(`https://${redirectServer}`);
});
/** Microsoft */
app.get('/logout/microsoft', async (req, res) => {
  console.log(`/logout/microsoft: received logout request: ${req.body}`);
  res.redirect(`https://${redirectServer}`);
});

/////////////////////////////////////////////////////////////////////
// Account Login with Authorization URLs
/////////////////////////////////////////////////////////////////////
/** Google */
app.get('/login/google', async (req, res) => {
  let authUrl = '/404';
  const scoping = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  try{
    authUrl = await gglWebAuth.generateAuthUrl({
      access_type: 'offline',
      scope: scoping,
      response_type: 'code',
      prompt: 'consent',
    });
  } catch (error) {
    console.error('/login/google: error:', error);
  }

  res.redirect(authUrl);
});

/** Microsoft */
app.get('/login/microsoft', async (req, res) => {
  let authUrl = '/404';

  const authCodeUrlParameters = {
    scopes: msWebAuthConfig.scopes,
    redirectUri: msWebAuth.config.auth.redirectUri,
    prompt: 'select_account',
  };

  //console.log(`/login/microsoft: authCodeUrlParameters: ${JSON.stringify(authCodeUrlParameters)}`);
  try{
    authUrl = await msWebAuth.getAuthCodeUrl(authCodeUrlParameters);
  } catch(error) {
    console.error('/login/microsoft: error in request', error);
  }
  //console.log(`/login/microsoft: Pushing Redirect Now!`);
  res.redirect(authUrl);  
});

/** Yahoo! */
app.get('/login/yahoo', (req, res) => {
  const clientID = yhooAuthKeys.yahoo.client_id;
  const redirectURI = yhooAuthKeys.yahoo.redirect_uri;
  const scopes = 'profile email';
  const authURL = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${clientID}&redirect_uri=${redirectURI}&response_type=code&scope=${scopes}&prompt=select_account`;
  res.redirect(authURL);
});

////////////////////////////////////////////////////////////////////////
// Get Authorization Tokens to access account info (email address only)
////////////////////////////////////////////////////////////////////////
/** Google */
app.get("/oauth/google", async (req, res) => {
  try {
    const qs = new url.URL(req.url, `http://${redirectServer}`).searchParams;
    const code = qs.get('code');

    // Now that we have the code, use that to acquire tokens.
    const token = await gglWebAuth.getToken(code);

    // Make sure to set the credentials on the OAuth2 client.
    gglWebAuth.setCredentials(token.tokens);

    // Get user info (including email)
    const oauth2 = google.oauth2({ auth: gglWebAuth, version: 'v2' });
    const { data } = await oauth2.userinfo.get();
    const signedInInfo = {
      email: data.email, 
      name: data.given_name
    };

    signedIn(req,signedInInfo);
  } catch (error) {
    console.error(`/oauth/google: error: ${error}`);
  }

  if ( req.session.lastPath ) {
    res.redirect(`https://${redirectServer}${req.session.lastPath}`);
    req.session.lastPath = null;
  } else {
    res.redirect(`https://${redirectServer}`);
  }
});

/** Microsoft */
app.get("/oauth/microsoft", async (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    redirectUri: msWebAuth.config.auth.redirectUri,    
    scopes: ['openid', 'profile', 'email'],
    code_verifier: codeVerifier,
  };

  //console.log(`tokenRequest: ${JSON.stringify(tokenRequest)}`);

  try {
    const response = await msWebAuth.acquireTokenByCode(tokenRequest);
    //console.log('/oauth/microsoft: Access token:', response.accessToken);
    // Use the access token for API requests
    const userEmail = response.idTokenClaims.email;
    const signedInInfo = {
      email: response.idTokenClaims.email, 
      name: response.idTokenClaims.given_name
    };


    signedIn(req,signedInInfo);
  } catch (error) {
    console.error('/oauth/microsoft: Error acquiring token:', error);
  }

  if ( req.session.lastPath ) {
    res.redirect(`https://${redirectServer}${req.session.lastPath}`);
    req.session.lastPath = null;
  } else {
    res.redirect(`https://${redirectServer}`);
  }
});

/** Yahoo! */
app.get('/oauth/yahoo', async (req, res) => {
  const authCode = req.query.code;
  const tokenURL = 'https://api.login.yahoo.com/oauth2/get_token';
  
  try {
    // Exchange authorization code for access token
    const tokenResponse = await axios.post(tokenURL, {
        client_id: yhooAuthKeys.yahoo.client_id,
        client_secret: yhooAuthKeys.yahoo.client_secret,
        redirect_uri: yhooAuthKeys.yahoo.redirect_uri,
        code: authCode,
        grant_type: 'authorization_code'
      }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const tokens = tokenResponse.data;
    const accessToken = tokens.access_token;

    // Request user info
    const userInfoURL = 'https://api.login.yahoo.com/openid/v1/userinfo';
    const userInfoResponse = await axios.get(userInfoURL, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    // userInfo from data packet
    const userInfo = userInfoResponse.data;
   
    const signedInInfo = {
      email: userInfo.email, 
      name: userInfo.given_name
    };

    signedIn(req,signedInInfo);
  } catch (error) {
    console.error(`get /oauth/yahoo: error:`, error);
    res.status(500).send(error.response.data);
  }

  if ( req.session.lastPath ) {
    res.redirect(`https://${redirectServer}${req.session.lastPath}`);
    req.session.lastPath = null;
  } else {
    res.redirect(`https://${redirectServer}`);
  }
});


// Request Home Page or Root Path
app.get('/', (req, res) => {
  res.render('index', {...setSignInInfo(req), title: 'Home Page' });
});

// No Access Page
app.get('/noaccess', (req, res) => {
  res.render('noaccess', {...setSignInInfo(req), title: 'No Access' });
});

// Heart
app.get('/turnourheart', (req, res) => {
  res.render('heart', {...setSignInInfo(req), title: 'Turn Our Hearts To The Lord' });
});

// Categories Game List
app.get('/categories', async (req, res) => {
  let gameInfo = [];
  let gameUrl = "";
  let editUrl = "";

  try{
    let gameList = OCategories.getGameList();
    if ( gameList.length == 0 ){
      gameList.push("None");
    }
    // format the list of games for consumption
    for ( gameID of gameList ){
      gameUrl = `/categories/game/:${gameID}`
      editUrl = "";
      try{
        let createdByInfo = await loadCreatedByInfo(OCategories.getGamePath(gameID));

        if ( createdByInfo && (serverDecrypt(createdByInfo['email']) == req.session.userId) ){
          editUrl = `/categories/edit/:${gameID}`;
        }
      } catch(error) {
        console.error(error);
      }

      gameInfo.push( {gameID:gameID, gameUrl:gameUrl, editUrl:editUrl} );
    }
  } catch (error) {
    console.error('Error in get /categories:', error);
    return res.status(500).send('Server error occurred');
  }

  //console.log(`/categories sending list: ${formattedGameList.join("/r/n")}`);
  res.render('categorieslist', {...setSignInInfo(req), title: 'Categories Game List', gameData: gameInfo  });
});

// validate categories game session data
async function validateSessionData(req, res, next){
  const gameID = req.params.gameID.replace(':','');

  if ( !req.session.authenticated ) {
    return res.status(401).send('Access denied. Please sign in first.');
  }

  try {
    if ( gameID != "New" ){
      // Need to validate that the session also controls
      //  the updating of the game data (if the data exists)
      let createdByInfo = await loadCreatedByInfo(OCategories.getGamePath(gameID));
      if ( createdByInfo ){
        if( req.session.userId != serverDecrypt(createdByInfo['email']) ){
          return res.status(401).send('Access denied. You are not the creator of this Game');
        }
      }      
    }
  } catch( error ) {
    console.error( `validateSessionData:`, error );
    return res.status(500).send('Server Error'); // Send error response
  }

  next();
}

// Change file save path depending on whether an update or new game
async function updateGamePath(req, res, next){
  const gameID = req.params.gameID.replace(':','');

  // clear the parameter
  setGamePath = "";

  // check to validate data actually came before further processing of the directory
  if ( req.body == null ){
    console.log(`updateGamePath: Received No FormData`);
    return res.status(401).send('Access denied. You are not the creator of this Game');
  }

  // if not a new game then do some extra processing
  if ( gameID != "New" ){
    setGamePath = gameID;

    try {
      // get the gamePath that should exist
      const gamePath = OCategories.getGamePath(gameID);
      // get the list of files from the directory
      const files = fs.readdirSync(gamePath);
      // clear the directory of any data before processing
      files.forEach(file => {
        const filePath = path.join(gamePath,file);
        fs.rmSync(filePath);
        //console.log(`Removed file: ${filePath}`);
      });
    } catch (error) {
      console.error( `updateGamePath:`, error );
      return res.status(500).send('Server Error'); // Send error response
    }   
  }

  next();
}

// Posting a created or editted game
app.post('/categories/gamedata/:gameID', validateSessionData, updateGamePath, upload.any(), (req, res) => {
  let gameID = req.params.gameID.replace(':','');  // set the gameID to a string without the colon...

  let redirectUrl = "/";
  
  // Add new game to the game list
  try {
    // Save the session information
    saveCreatedByInfo(req,lastMulterDirectory);
    if ( gameID == "New" ){
      // Iterate the available game ID
      gameID = OCategories.getCurrentGameAndUpdate();
    }
    setGamePath = ""; //!Important - clear override of game path
    // Generate redirect Url from gameID
    redirectUrl = `/categories/game/:${gameID}`
  } catch (error) {
    console.error(`app.post('/categories/gamedata/:${gameID}`, error);
    return res.status(500).send('Server error occurred');
  }

  res.status(201).json({ redirectUrl })
});


// Playing Actual Categories Game
app.get('/categories/gamedata/:gameID', (req, res) => {
  const gameID = req.params.gameID.replace(':','');  // set the gameID to a string without the colon...

  try{
    let jsonData = OCategories.getGameDataAsJSON(gameID);
    res.send(jsonData);
  } catch(error) {
    console.error('Error in get /categories/gamedata/:gameID', error);
    return res.status(500).send('Server error occurred');
  }
});

// Create a new Categories Game
app.get('/categories/edit/:gameID', async (req, res) => {
  let editURL = '/categories/gamedata/:New'; // default is to create a new game
  let useTitle = 'Create New Categories Game';
  let createdById = "";
  const gameID = req.params.gameID.replace(':','');  // set the gameID to a string without the colon...
  
  try {
    if ( gameID != "New" && OCategories.gameIDExists(gameID) ){
      try{
        let createdByInfo = await loadCreatedByInfo(OCategories.getGamePath(gameID));
        if ( createdByInfo ){
          createdById = serverDecrypt(createdByInfo['email']);
        }
      } catch(error) {
        console.error(error);
      }

      if ( createdById == req.session.userId ) { 
        editURL = `/categories/gamedata/:${gameID}`;
        useTitle = `Edit Categories Game ${gameID}`
      }
    }
  } catch(error) {
    console.error(error);
  }

  if ( req.session.authenticated ) {
    return res.render('categoriescreate', {...setSignInInfo(req), title: useTitle, gameID: gameID, dataURL: editURL });
  }

  res.render('noaccess', {...setSignInInfo(req), title: 'No Access' });
});

// Route for dynamic game URLs (http://mysite/game/AAAA, http://mysite/game/BBBB)
app.get('/categories/game/:gameID', async (req, res) => {
  let createdBy = "unknown";
  let gameExists = false;

  const gameID = req.params.gameID.replace(':','');  // set the gameID to a string without the colon...
  
  try {
    gameExists = OCategories.gameIDExists(gameID);
  } catch(error) {
    console.error(error);
  }

  // verify the game exists, otherwise send a 404 [TBD but need to 
  //  send a page saying gameID doesn't exist]
  if ( gameExists == false ){
    return res.status(404).render('404',{...setSignInInfo(req), 
                                         title: 'GameID Not Found',
                                         notFoundMsg: `GameID of "${gameID}" not found<br>Go back and check the /:GameID` });
  }

  try{
    let createdByInfo = await loadCreatedByInfo(OCategories.getGamePath(gameID));
    if ( createdByInfo ){
      createdBy = serverDecrypt(createdByInfo['name']);
      //console.log(`GameID: ${gameID} Created By: ${createdBy}`);
      //console.log(`GameID: ${gameID} Email: ${serverDecrypt(createdByInfo['email'])}`);
      //console.log(`GameID: ${gameID} IP: ${serverDecrypt(createdByInfo['ip'])}`);
    }
  } catch(error) {
    console.error(error);
  }

  // Send a success message after serving static files (optional)
  res.render('categoriesplay', {...setSignInInfo(req), title: `Categories Game ${gameID}`, madeBy: createdBy, gameDataURL: `/categories/gamedata/:${gameID}` });
});



////////////////////////////////////////////////////////////////
// Daily Scripture
//  inspiring scripture to lift the heart and mind and any
//  links or other useful things to help change to joy
////////////////////////////////////////////////////////////////

//// Post a new daily scripture blog entry
app.post('/dailyscripture/entry/:date', async (req, res) => {
  const date = req.params.date.replace(':','');  // set the date to a string without the colon...  
  let redirectUrl = "/";
  let useDate = "New";
  
  if ( !req.session.authenticated || req.session.userID != secretsFile.secrets.bloguser ) {
    return; // no entry is allowed
  }


  // Add new game to the game list
  try {
    // Save the session information
    //saveCreatedByInfo(req,[OptionsOnSavePath]);
    redirectUrl = `/dailyscripture/day/:${useDate}`
  } catch (error) {
    console.error(`app.post('/dailyscripture/entry/:${gameID}`, error);
    return res.status(500).send('Server error occurred');
  }

  res.status(201).json({ redirectUrl })
});

//// Create or edit a blog entry
app.get('/dailyscripture/entry/:date', async (req, res) => {
  let useTitle = 'Create New Daily Scripture Entry';
  let userName = 'Daily Scripture';
  const date = req.params.date.replace(':','');  // set the date to a string without the colon...  
  
  if ( !req.session.authenticated || req.session.userId != secretsFile.secrets.bloguser ) {
    return res.render('noaccess', {...setSignInInfo(req), title: 'Only The Site Administrator Is Allowed To Do This' });
  }

  try {
  } catch(error) {
    console.error(error);
  }

  res.render('blogentry', {...setSignInInfo(req), title: useTitle, blogUser: userName });
});

//// View a daily scripture entry
app.get('/dailyscripture/day/:date', async (req, res) => {
  const date = req.params.date.replace(':',''); // set the date to a string without the colon...
  let userID = secretsFile.secrets.bloguser;
  let blogID = date;
  let blogExists = false;
  
  try {
    //blogExists = OBlogs.doesBlogExist(userID, blogID);
  } catch(error) {
    console.error(error);
  }

  // verify the game exists, otherwise send a 404 [TBD but need to 
  //  send a page saying gameID doesn't exist]
  if ( blogExists == false ){
    return res.status(404).render('404',{...setSignInInfo(req), 
                                         title: 'Scripture Date Not Found',
                                         notFoundMsg: `The Daily Scripture for "${date}" does not exist<br>Go back and check the /:date` });
  }

  try{
    //let blogEntry = await OBlogs.getBlogEntry(userID, blogID);
  } catch(error) {
    console.error(error);
  }

  // Send a success message after serving static files (optional)
  // res.render('dailyscripture', {...setSignInInfo(req), title: `Categories Game ${gameID}`, madeBy: createdBy, gameDataURL: `/categories/gamedata/:${gameID}` });
  return res.status(404).render('404',{...setSignInInfo(req), title: 'DSR Not Finished', notFoundMsg: 'This Is Not Yet Done'});
});

// Play a video
app.get('/video/play/:videoID', async (req, res) => {
  const videoID = req.params.videoID.replace(':','');  // set the videoID to a string without the colon...
  let pageTitle = `Play Video: ${videoID}`;
  let videoFilePath = path.normalize(path.join(__dirname,`public/videos/${videoID}`));
  let htmlVideoPath = `/videos/${videoID}`;

  //if ( !req.session.authenticated ) {
  //  return res.render('noaccess', {...setSignInInfo(req), title: 'Cannot Watch This' });
  //}

  try {
    if ( fs.existsSync(videoFilePath) ){
      return res.render('vidplay', {...setSignInInfo(req), title: pageTitle, videoName: videoID, videoPath: htmlVideoPath });
    }
  } catch(error) {
    console.error(error);
  }

  return res.render('vidplay', {...setSignInInfo(req), title: `Video ${videoID} Doesn't Exist Watching: default.mp4`, videoName: 'default.mp4', videoPath: '/videos/default.mp4' });
});


// Setup to download an internet video
app.get('/video/download', async (req, res) => {
  return res.render('viddownload', {...setSignInInfo(req), title: `Video Download` });
});


// Download an internet video
app.post('/video/download/request', upload.none(), async (req, res) => {
  let downloadUrl = (req.body.videoFromUrl ? req.body.videoFromUrl : "");  // get the URL where the video is

  console.log(`app.post: /video/download/:url: received URL: ${downloadUrl}`);
  OMediaDownloader.getMediaInfo(downloadUrl);
  OMediaDownloader.getMedia(downloadUrl);
  
  res.status(201).json({ downloadUrl })
});

// Retrieve View and Any Stored Messages
app.get('/chat', (req, res) => {
  let userName = "Anonymous";
  if ( req.session.userId ){
    userName = req.session.userName;
  }    
  previousMsgs = messages.join('\r\n');
  if ( previousMsgs.trim() != "" ){
    previousMsgs += '\r\n';
  }
  res.render('chat', {...setSignInInfo(req), title: 'Chat', previousMessages: previousMsgs, userName: userName });
});

// Return to accept Dynamic Message
app.get('/chat/messages', (req, res) => {
  res.send('Success'); //200,201
});

// Dynamic Chat Message
app.post('/chat/messages', (req, res) => {
  if ( req.body == null ){
    return;
  }
  const stringed = JSON.stringify(req.body, null, 2);
  console.log("Received New Message: " + stringed);
  let message = "";
  let user = "";
  let bSent = false;

  const items = JSON.parse(stringed, (key, value) => {
    if ( key == 'user' ){
      user = value;
      //console.log('Found Chat User: ' + user);
    }
    if ( key == 'chat' ){
      message = value;
      //console.log('Found Chat Message: ' + message);
    }

    if ( !bSent && user.trim() != "" && message.trim() != "" ){
      var datetime = new Date();
      msg = datetime.toLocaleTimeString() + ": " + `${user}: ${message}`;

      //console.log(`Sending Chat Message: ${msg}`);
      io.emit('message', msg);
      messages.push(msg);
      //return;
      bSent = true;
    }
  });
});



app.use((error, req, res, next) => {
  console.log(`received error: ${error}`);
  console.log('This is the rejected field ->', error.field);
  console.log("---------------- Request Body -------------------");
  console.log(req.body);
  console.log("------------ End of Request Body ----------------")  
});



app.use((req, res) => {
  res.status(404).render('404',{...setSignInInfo(req), title: 'Site Not Found', notFoundMsg: '404 - URL not found on server' });
});

////////////////////////////////////////////////////////////////////////
// Defined Functions To Be Used In The
// Processing of the Path Data for the URLS
//
////////////////////////////////////////////////////////////////////////

/**
 * @param req express http request
 * @returns true if the http request is secure (comes form https)
 */
function isSecure(req) {
  if (req.headers['x-forwarded-proto']) {
    return req.headers['x-forwarded-proto'] === 'https';
  }
  return req.secure;
};

/**
 * Submits user creation information and saves it as a blob.
 * @param {Object} req - The request object containing session and IP information.
 */
function getEncryptedSessionInfo(req) {
  let submittedByJSON = null;

  try {
    // Check if session and user information are available
    if (!req.session.userId || !req.session.userName) {
      console.error('getEncryptedSessionInfo: Session or user information is missing');
      return;
    }

    // Create the user information JSON
    submittedByJSON = {
      email: serverEncrypt(req.session.userId),
      name: serverEncrypt(req.session.userName),
      ip: serverEncrypt(req.ip)
    };
  } catch (error) {
    console.error('getEncryptedSessionInfo: An error occurred:', error);
    throw(error);
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

  if ( fs.existsSync(fileName) == false ){
    //console.log(`loadCreatedByInfo: file does not exist: ${fileName}`);
    return createdByJSON;
  }

  try {
    const createdByBlob = fs.readFileSync(fileName,'utf-8');
    createdByJSON = JSON.parse(createdByBlob.toString('utf-8'));
  } catch (error) {
    console.error(`loadCreatedByInfo: Error loading or parsing createdBy file: ${fileName}`, error);
  }

  return createdByJSON;
}

/**
 * Submits user creation information and saves it as a blob.
 * @param {Object} req - The request object containing session and IP information.
 * @param {string} filePathName - The file path where the blob should be saved.
 */
function saveCreatedByInfo(req, filePath) {
  const fileName = path.normalize(filePath + '/createdby.txt');

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
        console.error('saveCreatedByInfo: Error saving submittedByBlob:', err);
      } else {
        //console.log('saveCreatedByInfo: submittedByBlob saved successfully to: ', fileName);
      }
    });
  } catch (error) {
    console.error('saveCreatedByInfo: An error occurred:', error);
  }
}

function setSignInInfo(req){
  const signInInfo = {
    signedInType:'Not Signed In',
    signedInNameVisible: 'invisible',
    signedInUserName: null,
    signedInEmailVisible: 'invisible',
    signedInUserEmail: null,
    signedInOutPath: '/signin',
    signedInOutText: 'Sign In',
  }
  //console.log(req.session);
  if ( req.session.authenticated ){
    signInInfo['signedInType'] = 'Signed In As';
    signInInfo['signedInNameVisible'] = 'visible';
    signInInfo['signedInUserName'] = req.session.userName;
    signInInfo['signedInEmailVisible'] = 'visible';
    signInInfo['signedInUserEmail'] = req.session.userId;    
    signInInfo['signedInOutPath'] = '/signout';
    signInInfo['signedInOutText'] = 'Sign Out';
  }

  return signInInfo;
}

// Sign-In Information
function signedIn(req, UserInfo) {
  //Set the user information
  req.session.authenticated = true;
  req.session.userId = UserInfo['email'];
  req.session.userName = UserInfo['name'];

  //console.log(store);
  console.log(`signedIn: signing in on session ${req.sessionID}`);
  console.log(`signedIn: signing in user ${UserInfo['email']}`);
  console.log(`signedIn: signing in user ${UserInfo['name']}`);
}

// Sign-In Information
function signedOut(req) {
  console.log(`signedOut: signing out on session ${req.sessionID}`);
  console.log(`signedOut: signing out user ${req.session.userId}`);

  //Clear the user information
  req.session.authenticated = false;
  req.session.userId = null;
  req.session.userName = null;
}


////////////////////////////////////////////////////
// anything that needs to run at startup
////////////////////////////////////////////////////
OCategories.getCurrentGame();

console.log('Global: Code Verifier:', codeVerifier);
console.log('Global: Code Challenge:', codeChallenge);
