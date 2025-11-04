// web agent
import mobileDetect from 'mobile-detect';

///////////////////////////////////////////////////////////
// Sign-In Information
///////////////////////////////////////////////////////////
function setSignInInfo(req) {
  const signInInfo = {
    signInVisibility: "d-none",
    signedInType: "Not Signed In",
    signedInUserName: null,
    signedInUserEmail: null,
    signedInOutPath: "/signin",
    signedInOutText: "Sign In",
    navMenuShow: "show",
    navMenuSize: "w-25",
    navBodyPad: "25%",
  };
  //console.log(req.session);
  if (req.session.authenticated) {
    (signInInfo["signInVisibility"] = ""),
    (signInInfo["signedInType"] = "Signed In As");
    signInInfo["signedInUserName"] = req.session.userName;
    signInInfo["signedInUserEmail"] = req.session.userId;
    signInInfo["signedInOutPath"] = "/signout";
    signInInfo["signedInOutText"] = "Sign Out";
  }

  // check for mobile user agent
  const md = new mobileDetect(req.headers["user-agent"]);

  if (md.mobile() || md.tablet()) {
    // User is on a mobile device
    signInInfo["navMenuShow"] = "";
    signInInfo["navMenuSize"] = "w-100";
    signInInfo["navBodyPad"] = "0%";
  }

  return signInInfo;
}

// Sign-In Information
function signedIn(req, UserInfo) {
  //Set the user information
  req.session.authenticated = true;
  req.session.userId = UserInfo["email"];
  req.session.userName = UserInfo["name"];

  //console.log(store);
  console.log(`signedIn: signing in on session ${req.sessionID}`);
  console.log(`signedIn: signing in user ${UserInfo["email"]}`);
  console.log(`signedIn: signing in user ${UserInfo["name"]}`);
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

export { setSignInInfo, signedIn, signedOut };

/////////////////////////////////////////////////////////////