//async fs module
import fs from 'node:fs/promises';

import express from 'express';
const router = express.Router();

import { setSignInInfo, signedIn, signedOut } from '../signin.js';

////////////////////////////////////////////
// Global Variables:
////////////////////////////////////////////
// import configuration
import { envFile, codeVerifier, codeChallenge } from '../config.js';
const redirectServer = envFile.useRedirect;

// oauth
import { google } from 'googleapis';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import * as msal from '@azure/msal-node';
import axios from 'axios';
import url from 'url';

// For PKCE code verifier/challenge

////////////////////////////////////////////////////////////
// OAuth Client Configuration and Objects
////////////////////////////////////////////////////////////
const gglAuthKeys = JSON.parse(await fs.readFile(envFile.gglAuthKeysFile, 'utf8'));
const msftAuthKeys = JSON.parse(await fs.readFile(envFile.msftAuthKeysFile, 'utf8'));
const yhooAuthKeys = JSON.parse(await fs.readFile(envFile.yhooAuthKeysFile, 'utf8'));


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

/////////////////////////////////////////////////////////////
// Basic Sign-In/Out URL / Redirects
/////////////////////////////////////////////////////////////
router.post('/signin/lastpath', (req, res) => {
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

router.get('/signin', async (req, res) => {
  res.render('signin', {...setSignInInfo(req), title: 'Sign-In to Website' });
});

router.get('/signout', async (req, res) => {
  signedOut(req);
  res.redirect(`https://${redirectServer}`);
});

/////////////////////////////////////////////////////////////////////
// Allow 'forced' logout from ID authorities
/////////////////////////////////////////////////////////////////////
/** Google */
router.get('/logout/google', async (req, res) => {
  console.log(`/logout/google: received logout request: ${req.body}`);
  res.redirect(`https://${redirectServer}`);
});
/** Microsoft */
router.get('/logout/microsoft', async (req, res) => {
  console.log(`/logout/microsoft: received logout request: ${req.body}`);
  res.redirect(`https://${redirectServer}`);
});

/////////////////////////////////////////////////////////////////////
// Account Login with Authorization URLs
/////////////////////////////////////////////////////////////////////
/** Google */
router.get('/login/google', async (req, res) => {
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
router.get('/login/microsoft', async (req, res) => {
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
router.get('/login/yahoo', (req, res) => {
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
router.get("/oauth/google", async (req, res) => {
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
router.get("/oauth/microsoft", async (req, res) => {
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
router.get('/oauth/yahoo', async (req, res) => {
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


export default router;
