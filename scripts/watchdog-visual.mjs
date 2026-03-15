import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('Running Playwright visual tests...');

try {
  // Execute playwright visual tests
  execSync('npx playwright test e2e/visual.spec.ts --reporter=list', { 
    stdio: 'inherit',
    cwd: projectRoot
  });
  console.log('✅ Visual regression tests passed!');
} catch (error) {
  console.error('❌ Visual tests failed! Watchdog triggered.');
  
  const testResultsDir = path.join(projectRoot, 'test-results');
  let diffFiles = [];
  
  if (fs.existsSync(testResultsDir)) {
    const walkSync = (dir, filelist = []) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const dirFile = path.join(dir, file);
        if (fs.statSync(dirFile).isDirectory()) {
          filelist = walkSync(dirFile, filelist);
        } else {
          if (file.endsWith('-diff.png')) {
            filelist.push(dirFile);
          }
        }
      }
      return filelist;
    };
    diffFiles = walkSync(testResultsDir);
  }
  
  if (diffFiles.length > 0) {
    console.log(`Found ${diffFiles.length} visual diffs. Building Swarm IPC task...`);
    
    // Construct task payload for Swarm IPC / Delegate
    const taskPayload = {
      type: "visual_regression",
      title: "Fix Visual Regression (TailwindCSS)",
      description: "Playwright caught a visual regression. Please analyze the diffs and suggest Tailwind CSS fixes.",
      attachments: diffFiles.map(file => ({
        path: file,
        type: "image/png"
      })),
      timestamp: new Date().toISOString()
    };
    
    const taskPath = path.join(projectRoot, 'swarm-visual-task.json');
    fs.writeFileSync(taskPath, JSON.stringify(taskPayload, null, 2));
    
    console.log(`Task generated at: ${taskPath}`);
    console.log(`Triggering AI Swarm resolution...`);

    // In a real environment, we would POST this to the Swarm backend or CLI:
    // try {
    //   execSync(`jaskier-cli swarm delegate --file ${taskPath}`);
    // } catch (e) { ... }
  } else {
    console.log('No diff images found. Playwright might have failed for another reason.');
  }

  // Fail the CI build
  process.exit(1);
}
