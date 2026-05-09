const fs = require('fs');
const path = require('path');

const htmlPath = path.join('d:', 'PROYECTO ANTIGRAVITY', 'R&R CRM', 'RR_App_Ultra_V5.html');
const outPath = path.join('d:', 'PROYECTO ANTIGRAVITY', 'R&R CRM', 'rr-crm-online', 'src', 'LegacyApp.jsx');

const html = fs.readFileSync(htmlPath, 'utf8');

const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);

if (match && match[1]) {
    let code = match[1];
    
    // Replace imports
    code = code.replace(/from\s+'https:\/\/esm\.sh\/react@[^']+'/g, "from 'react'");
    code = code.replace(/from\s+'https:\/\/esm\.sh\/react-dom@[^']+'/g, "from 'react-dom/client'");
    code = code.replace(/from\s+'https:\/\/esm\.sh\/lucide-react@[^']+'/g, "from 'lucide-react'");
    
    // Export MainApp
    code = code.replace('var MainApp = () => {', 'export default function MainApp() {');
    
    // Remove the ReactDOM.createRoot part at the end
    code = code.replace(/var root = ReactDOM\.createRoot\([\s\S]*/, '');

    // Add DataManager Firebase connection override
    // Wait, DataManager is defined in the script. 
    // We can export DataManager from there or we can import the new DataManager and replace the old one.
    // Let's just write the code first.

    fs.writeFileSync(outPath, code);
    console.log("LegacyApp.jsx created successfully!");
} else {
    console.log("Could not find the module script.");
}
