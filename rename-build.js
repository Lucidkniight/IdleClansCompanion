const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const files = fs.readdirSync(buildDir);

// Rename files: replace spaces with dashes
files.forEach(file => {
  if (file.includes(' ') && (file.endsWith('.exe') || file.endsWith('.blockmap'))) {
    const newName = file.replace(/\s+/g, '-');
    fs.renameSync(
      path.join(buildDir, file),
      path.join(buildDir, newName)
    );
    console.log(`Renamed: ${file} → ${newName}`);
  }
});

// Fix latest.yml to match renamed files
const ymlPath = path.join(buildDir, 'latest.yml');
if (fs.existsSync(ymlPath)) {
  let yml = fs.readFileSync(ymlPath, 'utf8');
  yml = yml.replace(/IdleClansCompanion Setup/g, 'IdleClansCompanion-Setup');
  fs.writeFileSync(ymlPath, yml);
  console.log('Fixed latest.yml references');
}