# Browser Javscript Gif Decoder

A gif decoder in pure browser javascript.

##Usage

Import library in html
```html
<script src="gif_decoder_.js" type="module"></script>
```

Usage in Javascript
```javascript
import Gif from "./gif_decoder_.js";

// From HTMLImageElement
const image = /* <img> */
Gif.fromImageAsync(image).then((gif) => {
    gif.decode()
    console.log(gif.toObject(), gif.getOffsets());
});

// From File
const file = /* File input/drag&drop/etc */
Gif.fromFileAsync(file).then((gif) => {
    gif.decode()
    console.log(gif.toObject(), gif.getOffsets());
});

// From Blob
const blob = /* Blob */
Gif.fromBlobAsync(blob).then((gif) => {
    gif.decode()
    console.log(gif.toObject(), gif.getOffsets());
});
```

There are several other methods, play around with it and alter as needed

## Draw frames

**NOTE** TODO add interlacing code (currently doesnt' support interlacing)

```javascript
gif.decode();
const frames = gif.getFrames();

frames.forEach((frame) => {
    // const frameData = frame.toObject();
    const {width, height} = frame.getDimensions();
    const canvas = /* HTMLCanvasElement */
    const ctx = canvas.getContext('2d');
    const pixels = frame.getDecodedPixels();
    canvas.width = width;
    canvas.height = height;
    let px = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            ctx.fillStyle = pixels[px] || 'transparent';
            ctx.fillRect(x, y, 1, 1);
            px++;
        }
    }

});
```

Readme is a WIP, I'll add more methods/usage examples soon

Demo coming soon at https://gif.grgr.us