const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Get all available modules in the Prebid.js modules directory
 * @returns {Set<string>} Set of module names (without extension)
 */
function getAvailableModules() {
  const modulesDir = path.join(__dirname, '../modules');
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  const modules = new Set();

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Directories like userId, rtdModule are valid modules
      modules.add(entry.name);
    } else if (entry.isFile()) {
      // Match .js and .ts files, extract module name
      const match = entry.name.match(/^(.+)\.(js|ts)$/);
      if (match) {
        modules.add(match[1]);
      }
    }
  }
  return modules;
}

/**
 * Validate that all requested modules exist
 * @param {string[]} adapters - List of adapter names (without BidAdapter suffix)
 * @param {string[]} modules - List of module names
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateModules(adapters, modules) {
  const available = getAvailableModules();
  const errors = [];

  for (const adapter of adapters) {
    const adapterModule = `${adapter}BidAdapter`;
    if (!available.has(adapterModule)) {
      errors.push(`Adapter not found: ${adapter} (expected modules/${adapterModule}.js)`);
    }
  }

  for (const mod of modules) {
    if (!available.has(mod)) {
      errors.push(`Module not found: ${mod} (expected modules/${mod}.js or .ts)`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function buildForSite(siteId) {
  const configPath = path.join(__dirname, '../bliink-builds', `${siteId}.json`);

  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Validate modules before building
  const validation = validateModules(config.adapters, config.modules);
  if (!validation.valid) {
    console.error('\n❌ Invalid modules in config:\n');
    for (const error of validation.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  // Build the modules list for gulp
  const modules = [
    ...config.adapters.map(a => `${a}BidAdapter`),
    ...config.modules
  ].join(',');

  console.log(`\n=== Building Prebid.js for ${siteId} ===`);
  console.log(`Adapters: ${config.adapters.length}`);
  console.log(`Modules: ${config.modules.length}`);
  console.log(`Total modules: ${modules.split(',').length}`);

  // Build
  execSync(`npx gulp build --modules=${modules}`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  // Create output directory
  const outputDir = path.join(__dirname, '../dist/sites');
  fs.mkdirSync(outputDir, { recursive: true });

  // Read the build and calculate hash
  const buildPath = path.join(__dirname, '../build/dist/prebid.js');
  const buildContent = fs.readFileSync(buildPath);
  const hash = crypto.createHash('sha256').update(buildContent).digest('hex').slice(0, 8);

  // Copy with hash in filename
  const outputPath = path.join(outputDir, `${siteId}.${hash}.js`);
  fs.copyFileSync(buildPath, outputPath);

  // Also create a version without hash (latest)
  const latestPath = path.join(outputDir, `${siteId}.js`);
  fs.copyFileSync(buildPath, latestPath);

  const stats = fs.statSync(outputPath);
  const sizeKb = Math.round(stats.size / 1024);

  console.log(`\n✓ Built: ${outputPath} (${sizeKb} KB)`);
  console.log(`✓ Latest: ${latestPath}`);

  // Write the manifest
  const manifest = {
    siteId,
    hash,
    size: stats.size,
    adapters: config.adapters,
    modules: config.modules,
    buildDate: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(outputDir, `${siteId}.manifest.json`),
    JSON.stringify(manifest, null, 2)
  );

  return { siteId, hash, size: stats.size };
}

// Main
const siteId = process.argv[2];
if (!siteId) {
  console.error('Usage: node scripts/build-for-site.js <siteId>');
  console.error('Example: node scripts/build-for-site.js MAGAZINEAVANTAGES');
  process.exit(1);
}

buildForSite(siteId);
