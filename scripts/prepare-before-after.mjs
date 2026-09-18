#!/usr/bin/env node
/**
 * Builds the four before/after slider images from raw source photos.
 *
 * The "before" (dirty) shots are full-res HEIC->JPEG exports from an iPhone
 * (portrait, 2268x4032). The "after" (clean) shots are 602x1308 screenshots
 * with black letterbox bars; the real photo content is rows 252-1055
 * (602x804, ~3:4).
 *
 * Both sides are normalized to 600x800 (3:4) JPEGs so neither half of the
 * wipe looks sharper than the other at the seam - the clean screenshots are
 * the resolution ceiling here. Re-run this after dropping in better-matched,
 * full-resolution photos; it always outputs the same four filenames.
 *
 * Usage: node scripts/prepare-before-after.mjs <sourceDir> <outDir>
 *   sourceDir must contain: blue_dirty_full.jpg, green_dirty_full.jpg,
 *   blue_clean_raw.jpg, green_clean_raw.jpg (see README notes below for how
 *   these were produced from the original HEIC/JPEG exports via `sips`).
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const [, , sourceDir, outDir] = process.argv;

if (!sourceDir || !outDir) {
    console.error('Usage: node scripts/prepare-before-after.mjs <sourceDir> <outDir>');
    process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const TARGET_WIDTH = 600;
const TARGET_HEIGHT = 800;
const JPEG_QUALITY = 80;

// Dirty shots: native 2268x4032 portrait. Center-crop the height down to a
// 3:4 ratio (2268x3024) before resizing, so the bin stays centered.
async function processDirty(inFile, outFile) {
    const meta = await sharp(inFile).metadata();
    const targetHeight = Math.round((meta.width * TARGET_HEIGHT) / TARGET_WIDTH);
    const top = Math.round((meta.height - targetHeight) / 2);

    await sharp(inFile)
        .extract({ left: 0, top, width: meta.width, height: targetHeight })
        .resize(TARGET_WIDTH, TARGET_HEIGHT)
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(outFile);
}

// Clean shots: 602x1308 screenshot with black letterbox bars. Real content
// measured at rows 252-1055 (602x804), already ~3:4 - just extract and
// resize to the exact target (barely any scaling).
async function processClean(inFile, outFile) {
    await sharp(inFile)
        .extract({ left: 0, top: 252, width: 602, height: 804 })
        .resize(TARGET_WIDTH, TARGET_HEIGHT)
        .jpeg({ quality: JPEG_QUALITY })
        .toFile(outFile);
}

const jobs = [
    ['blue_dirty_full.jpg', 'blue_bin_before.jpg', processDirty],
    ['green_dirty_full.jpg', 'green_bin_before.jpg', processDirty],
    ['blue_clean_raw.jpg', 'blue_bin_after.jpg', processClean],
    ['green_clean_raw.jpg', 'green_bin_after.jpg', processClean],
];

for (const [inName, outName, fn] of jobs) {
    const inFile = path.join(sourceDir, inName);
    const outFile = path.join(outDir, outName);
    await fn(inFile, outFile);
    console.log(`wrote ${outFile}`);
}
