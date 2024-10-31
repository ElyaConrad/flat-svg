# Flatten SVG

This library can flatten a complex SVG structure completely down to a single elements with **one** clip-path instead of a nesed tree of clip-paths or transforms.

### What is does

In fact, this will collect all transform matrixes and clip-paths from top to bottom and apply them in tzhe right order. The result is **one** transform matrix and **one** clip-path (which also respects the transforms).

## Example

Use the `tests/test.svg` file from the GitHub repo or just copy the test file's contents.

```typescript
// This example uses nodejs, so we're using JSDOM here but you can use it in the browser out of the box
import fs from 'fs/promises';
import { simplifySVG } from 'flat-svg';
import { JSDOM } from 'jsdom';
import formatXml from 'xml-formatter';

// Just creating a DOM from the test.svg file
const { document } = new JSDOM(await fs.readFile('test.svg', 'utf-8'), {
  pretendToBeVisual: true,
}).window;

// Global SVG element
const svg = document.querySelector('svg')!;

// New SVG element
const simplifiedSVG = simplifySVG(svg, {
  clipAfterElementTransform: false, // This will wrap each element that has any kind of clip-path into a group that rthen will be clipped
  keepGroupTransforms: false, // If you like to keep te group structure (that is actually doing transforms), the
});

// Oprional but pretty pretty
const prettyNewSVG = formatXml(simplifiedSVG.outerHTML, {
  collapseContent: true,
});

await fs.writeFile('test2.svg', prettyNewSVG);
```

## Example Result

**This is our test.svg file**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">

    <rect x="0" y="0" width="100%" height="100%" style="fill: none; stroke: #000;" />
    <rect x="10" y="10" width="200" height="200" style="fill: #f00;" />

    <defs>
        <linearGradient id="Gradient2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="red" />
            <stop offset="50%" stop-color="black" stop-opacity="0" />
            <stop offset="100%" stop-color="blue" />
        </linearGradient>
    </defs>


    <rect x="600" y="600" width="200" height="200" fill="url(#Gradient2)" />


    <g style="transform: translate(0px, 1px);">
        <defs>
            <clipPath id="clip2">
                <rect x="350" y="200" width="200" height="400" style="fill: #000;" />
            </clipPath>
        </defs>
        <g style="clip-path: url(#clip2)">
            <g style="transform: translate(100px, 0px);">
                <defs>
                    <clipPath id="clip1">
                        <path style="transform: translate(150px, 330px);" d="M140 20C73 20 20 74 20 140c0 135 136 170 228 303 88-132 229-173 229-303 0-66-54-120-120-120-48 0-90 28-109 69-19-41-60-69-108-69z" />
                    </clipPath>
                </defs>
                <g style="clip-path: url(#clip1)">
                    <image href="https://picsum.photos/seed/flat-svg/600/450" x="200" y="200" width="600" height="450" style="transform: rotate(15deg);" />
                </g>
            </g>
        </g>
    </g>

    <g style="transform: rotate(-10deg);">
        <text x="400" y="200" style="font-size: 32px; transform: translate(100px, 0px);">
            HELLO WORLD!!!
        </text>
        <defs>
            <clipPath id="clip3">
                <circle cx="550" cy="320" r="50" />
            </clipPath>
        </defs>
        <text x="500" y="300" style="font-size: 32px; clip-path: url(#clip3);">
            <tspan>FOO</tspan>
            <tspan>BAR</tspan>
        </text>
    </g>
</svg>

```

**This is our simplified result:**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
    <defs class="gradients">
        <linearGradient id="Gradient2" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="red"/>
            <stop offset="50%" stop-color="black" stop-opacity="0"/>
            <stop offset="100%" stop-color="blue"/>
        </linearGradient>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" style="fill: none; stroke: #000; clip-path: url('#cnigvbnqx5')"/>
    <rect x="10" y="10" width="200" height="200" style="fill: #f00; clip-path: url('#ch6k0vve1m4')"/>
    <rect x="600" y="600" width="200" height="200" fill="url(#Gradient2)" style="clip-path: url('#qllppazwdzg')"/>
    <defs>
        <clipPath id="vjxy4z3z0s">
            <path d="M396.77288,514.85073l-62.95607,-234.95525c10.91767,-7.45429 23.29654,-13.23705 36.88834,-16.87897c46.36444,-12.42331 93.21433,4.01103 122.1785,38.69643c4.42798,-25.46643 17.22608,-48.77195 36.04756,-66.38125l61.02683,227.75523z"/>
        </clipPath>
    </defs>
    <image href="https://picsum.photos/seed/flat-svg/600/450" x="200" y="200" width="600" height="450" style="transform: matrix(0.9659258262890683, 0.25881904510252074, -0.25881904510252074, 0.9659258262890683, 100, 1); clip-path: url('#vjxy4z3z0s')"/>
    <text x="400" y="200" style="font-size: 32px; transform: matrix(0.984807753012208, -0.17364817766693033, 0.17364817766693033, 0.984807753012208, 98.4807753012208, -17.364817766693033); clip-path: url('#zoln7edmqab')">
        HELLO WORLD!!!
    </text>
    <defs>
        <clipPath id="798sz123qas">
            <path d="M500,320c0,-27.61424 22.38576,-50 50,-50c27.61424,0 50,22.38576 50,50c0,27.61424 -22.38576,50 -50,50c-27.61424,0 -50,-22.38576 -50,-50z"/>
        </clipPath>
    </defs>
    <text x="500" y="300" style="font-size: 32px; clip-path: url('#798sz123qas'); transform: matrix(0.984807753012208, -0.17364817766693033, 0.17364817766693033, 0.984807753012208, 0, 0)">
        <tspan>FOO</tspan>
        <tspan>BAR</tspan>
    </text>
</svg>

```
