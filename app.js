#!/usr/bin/env node

(async () => {
  const fs = require("fs");
  const postcss = require("postcss");
  const chroma = require("chroma-js");
  const Comb = require("csscomb");
  const comb = new Comb("zen");

  const args = process.argv.slice(2);

  let sourceFilePath = args[0] || undefined;
  let targetPath = args[1] || undefined;

  if (!sourceFilePath) {
    console.error("No source file path provided");
    process.exit(1);
  }

  if (!targetPath) {
    const sourceFileDir = sourceFilePath.split("/").slice(0, -1).join("/");
    targetPath = `${sourceFileDir}/output.css`;
  }

  let css = fs.readFileSync(sourceFilePath, "utf8");

  // Step 0: Format CSS file
  const config = require("./.csscomb.json");
  comb.configure(config);

  console.log("Formatting CSS file");
  css = await comb.processString(css, { configPath: "./.csscomb.json" });
  console.log("CSS file formatted");

  // Step 1: Parse CSS file
  const parsedCss = postcss.parse(css);

  // Step 2: Extract color values
  const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/;
  const rgbRegex = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/;
  const colorValues = new Set();

  parsedCss.walkDecls((decl) => {
    const hexMatches = decl.value.match(hexRegex);
    if (hexMatches) {
      hexMatches.forEach((hexMatch) => {
        colorValues.add(hexMatch);
      });
    }

    const rgbMatches = decl.value.match(rgbRegex);
    if (rgbMatches) {
      rgbMatches.forEach((rgbMatch) => {
        colorValues.add(`rgb(${rgbMatch})`);
      });
    }
  });

  // Step 3: Group similar color values
  const colorGroups = {};

  colorValues.forEach((colorValue) => {
    try {
      const roundedColor = chroma(colorValue).hex();
      if (!colorGroups[roundedColor]) {
        colorGroups[roundedColor] = [];
      }
      colorGroups[roundedColor].push(colorValue);
    } catch (e) {
      console.error(
        `Error processing color value "${colorValue}": ${e.message}`
      );
    }
  });

  // Step 4: Generate new CSS file with variables
  let newCss = "";
  let variableDeclarations = "";

  Object.entries(colorGroups).forEach(([roundedColor, colorValues], index) => {
    const varName = `--color-${index}`;
    variableDeclarations += `${varName}: ${roundedColor};\n`;
    newCss += `/* ${colorValues.join(", ")} */\n`;
    newCss += `${varName}: ${roundedColor};\n`;
    colorValues.forEach((colorValue) => {
      parsedCss.walkDecls((decl) => {
        if (decl.value === colorValue) {
          decl.value = `var(${varName})`;
        }
      });
    });
  });

  // Insert variable declarations at beginning of new CSS file
  newCss = `:root{\n${variableDeclarations}\n} \n${parsedCss}`;

  // Write new CSS file
  fs.writeFile(targetPath, newCss, { flag: "wx" }, (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log(`Generated new CSS file with variables at: ${targetPath}`);
  });
})();
