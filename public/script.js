/*!
 * script.js 0.0.1
 * Family Website Public JavaScript
 * Supporting universal site functions
 *
 */

'use strict';

function createRect(Left, Top, Width, Height) {
    let rect = { x: Left, y: Top, width: Width, height: Height };
    console.log('created rect: x:' + Left + ' y:' + Top + ' width:' + Width + ' height:' + Height);
    return rect;
}

function calculateSpaceRect(element) {
    //get navbar and foot dimensions
    navbar = document.getElementById('navbar');
    footer = document.getElementById('footer');

    var rctNav = navbar.getBoundingClientRect();
    var rctFoot = footer.getBoundingClientRect();

    let rect = createRect(0,
        navbar.offsetHeight,
        window.screen.width,
        rctFoot.top);

    //if null just give back maximum space
    // adjusted for navbar and footer
    if (element == null || element.parentElement == null) {
        return rect;
    }

    //TODO: Scan around for sibling elements
    // to determine space available between each
    // accounting for margins, etc.
}

function calculateMaxSpaceFromRect(Rect) {
    //Check for a valid rect
    if (Rect == null || Rect.width == 0 || Rect.height == 0) {
        return { width: 0, height: 0 };
    }

    let w = Rect.width - Rect.x;
    let h = Rect.height - Rect.y;

    return { width: w, height: h };
}


/**
 * Gets the word size (height and width) for each word rendered
 *
 * @param {string} text - The entire text to be measured.
 * @param {string} font - The font string used for text rendering.
 * @param {object} ctx - 2D canvas used for rendering and measuring.
 * @returns {object[{word,width,height}]} - An array of strings representing the wrapped text lines.
 */
async function getWordMetrics(text, font, ctx){
    const words = text.split(" ");
    const wordMetrics = [];
    
    if ( font == null || font == "" ){
        console.log(`getWordMetrics: font was null or empty`);
    }

    if ( ctx == null ){
        console.log(`getWordMetrics: ctx was null`);
    }
    
    ctx.font = font;
    ctx.fillStyle = "black";

    for (const word of words) {
        const textMetrics = ctx.measureText(word);

        const textWidth = parseInt(textMetrics.actualBoundingBoxLeft) + parseInt(textMetrics.actualBoundingBoxRight);
        const textHeight = parseInt(textMetrics.actualBoundingBoxAscent) + parseInt(textMetrics.actualBoundingBoxDescent);

        wordMetrics.push({word:word,width:textWidth,height:textHeight});
    }

    return wordMetrics;
}

/**
 * Converts a given text string into a data URL representing an image.
 * This function uses the OffscreenCanvas API to render the text off-screen,
 * avoiding rendering it directly to the webpage.
 *
 * @param {string} text - The text content to convert into an image.
 * @param {number} maxWidth - The maximum width of the output image in pixels.
 * @param {number} maxHeight - The maximum height of the output image in pixels.
 * @returns {string} - A data URL representing the generated image.
 */
async function convertTextToImageOffscreen(text, fontSize, maxWidth, maxHeight) {
    /**
     * Creates an OffscreenCanvas element with the specified dimensions.
     * @type {OffscreenCanvas}
     */
    const canvas = new OffscreenCanvas(maxWidth, maxHeight);
    let useFontSize = fontSize;

    /**
     * Gets the 2D rendering context of the OffscreenCanvas.
     * @type {CanvasRenderingContext2D}
     */
    const ctx = canvas.getContext("2d");

    // Set font size and other drawing options here (adjust based on your needs)
    ctx.font = `${useFontSize}px Arial`;
    ctx.fillStyle = "black";

    // get the metrics for each word given to determine which words
    //   might over-fill the boundaries of the region
    try {
        let wordMetrics = await getWordMetrics(text, `${useFontSize}px Aria`, ctx);
        let maxWordWidth = 0;
        for( const metric of wordMetrics ){
            maxWordWidth = ( maxWordWidth > parseInt(metric["width"]) ? maxWordWidth : parseInt(metric["width"]));
        };

        if ( maxWordWidth > maxWidth ){
            useFontSize = (maxWidth / maxWordWidth) * (useFontSize - useFontSize*0.1); // decrease 10% for rounding I suppose
        }
    } catch( error ){
        console.error(error);
    }

    // Change fontsize based upon the longest rendered word
    ctx.font = `${useFontSize}px Arial`;

    /**
     * Wraps the provided text into lines that fit within the canvas width.
     * You can replace this function with a more robust text wrapping library.
     *
     * @param {string} text - The text to be wrapped.
     * @param {number} maxWidth - The maximum width for each line.
     * @param {string} font - The font string used for text rendering.
     * @returns {string[]} - An array of strings representing the wrapped text lines.
     */
    function wrapText(text, maxWidth, font) {
        const words = text.split(" ");
        let line = "";
        const lines = [];
        for (const word of words) {
            const testLine = line + word + " ";
            const testWidth = ctx.measureText(testLine).width;
            if (testWidth > maxWidth) {
                lines.push(line.trim());
                line = word + " ";
            } else {
                line = testLine;
            }
        }
        lines.push(line.trim());
        return lines;
    }

    const lines = wrapText(text, maxWidth, ctx.font);
    let y = (maxHeight / 2) - ((fontSize * lines.length) / 2); // Adjust starting y-position to be near center
    for (const line of lines) {
        let x = maxWidth / 2 - ctx.measureText(line).width / 2;
        ctx.fillText(line, x, y); // Adjust x-position
        y += fontSize + fontSize / 10; // Adjust line spacing
    }

    let blob = await canvas.convertToBlob();

    const dataUrl = URL.createObjectURL(blob);
    // You can use the dataUrl to create an image element or download it
    return dataUrl;
}