import React, { useState, useEffect } from 'react';
import { ApiService } from '../../services/ApiService';

const ProjectRegistration: React.FC = () => {
  const [hasGlobalCommands, setHasGlobalCommands] = useState<boolean | null>(null);

  useEffect(() => {
    const checkGlobalCommands = async () => {
      try {
        const result = await ApiService.checkGlobalCommands();
        setHasGlobalCommands(result.hasGlobalCommands);
      } catch (error) {
        console.error('Failed to check global commands:', error);
        setHasGlobalCommands(false);
      }
    };

    checkGlobalCommands();
  }, []);

  return (
    <div className="config-section">
      <div className="config-file">
        <h4>Register New Projects</h4>
        
        <div className="help-text">
          <p>Projects must be registered using the command line interface:</p>
          
          {hasGlobalCommands === null ? (
            <p>Checking available commands...</p>
          ) : hasGlobalCommands ? (
            <div>
              <p><strong>Recommended method (global commands installed):</strong></p>
              <ul>
                <li><code>cm-reg</code> - Run from any project directory to register it</li>
                <li><code>cm-unreg</code> - Unregister a project</li>
              </ul>
            </div>
          ) : (
            <div>
              <p><strong>Install global commands first:</strong></p>
              <ol>
                <li>Run <code>./install.sh</code> from this project directory</li>
                <li>Restart your terminal or run <code>source ~/.zshrc</code></li>
                <li>Use <code>cm-reg</code> to register projects</li>
              </ol>
              
              <p><strong>Alternative method:</strong></p>
              <ul>
                <li><code>npm run claude:register</code> - Run from any project directory</li>
              </ul>
            </div>
          )}
          
          <p><strong>Example usage:</strong></p>
          <pre>
{`cd /path/to/your/project
${hasGlobalCommands ? 'cm-reg' : 'npm run claude:register'}`}
          </pre>
        </div>
      </div>
    </div>
  );
};

export default ProjectRegistration;