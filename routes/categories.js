//async fs module
import fs from 'node:fs/promises';

import express from 'express';
const router = express.Router();

// form control
import bodyParser from 'body-parser';
import formidable from 'formidable';
import multer from 'multer';

// private functions
import { serverEncrypt, serverDecrypt, serverObfuscateData } from '../private/code/crypto_utils.js';

// oauth
import axios from 'axios';

// custom JS objects
import OCategories from "../categories.js";

import { setSignInInfo, signedIn, signedOut } from '../signin.js';

////////////////////////////////////////////
// Global Variables:
////////////////////////////////////////////
// import configuration
import { envFile, codeVerifier, codeChallenge } from '../config.js';
const redirectServer = envFile.useRedirect;

var lastMulterDirectory = "";
var setGamePath = "";

// Configure multer to use memory storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Set the destination to a private directory
    const privatePath = __dirname + "../private/categories/games";
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





///////////////////////////////////////////////////////////
// Routes
///////////////////////////////////////////////////////////


// Categories Game List
router.get("/categories", async (req, res) => {
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
router.post(
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
router.get("/categories/gamedata/:gameID", (req, res) => {
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
router.get("/categories/edit/:gameID", async (req, res) => {
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
router.get("/categories/game/:gameID", async (req, res) => {
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

////////////////////////////////////////////////////
// anything that needs to run at startup
////////////////////////////////////////////////////
OCategories.getCurrentGame();

export default router;