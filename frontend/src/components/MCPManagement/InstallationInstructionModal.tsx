import React, { useState } from 'react';
import { X, Copy, CheckCircle, AlertTriangle, Terminal, FileText } from 'lucide-react';
import './InstallationInstructionModal.css';

interface InstallationStep {
  command: string;
  description: string;
  workingDirectory?: string;
  requiresManualAction?: boolean;
}

interface InstallationInstructionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAsTemplate: (templateData: any) => void;
  mcpName: string;
  mcpDescription: string;
  installationSteps: InstallationStep[];
  environmentVars: Array<{
    key: string;
    description: string;
    required: boolean;
  }>;
  finalCommand: {
    command: string;
    args: string[];
    transport: string;
  };
}

const InstallationInstructionModal: React.FC<InstallationInstructionModalProps> = ({
  isOpen,
  onClose,
  onSaveAsTemplate,
  mcpName,
  mcpDescription,
  installationSteps,
  environmentVars,
  finalCommand
}) => {
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const copyToClipboard = async (text: string, stepIndex: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(stepIndex);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const toggleStepCompletion = (stepIndex: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepIndex)) {
      newCompleted.delete(stepIndex);
    } else {
      newCompleted.add(stepIndex);
    }
    setCompletedSteps(newCompleted);
  };

  const handleSaveAsTemplate = () => {
    const templateData = {
      name: mcpName,
      description: mcpDescription,
      installationSteps,
      environmentVars,
      finalCommand,
      installationType: 'manual',
      createdAt: Date.now()
    };
    onSaveAsTemplate(templateData);
  };

  const allStepsCompleted = completedSteps.size === installationSteps.length;
  const requiredEnvVarsFilled = environmentVars
    .filter(env => env.required)
    .every(env => envValues[env.key]?.trim());

  return (
    <div className="installation-modal-overlay">
      <div className="installation-modal">
        <div className="installation-modal-header">
          <div className="installation-modal-title">
            <Terminal size={20} />
            <h3>Installation Instructions: {mcpName}</h3>
          </div>
          <button onClick={onClose} className="installation-modal-close">
            <X size={20} />
          </button>
        </div>

        <div className="installation-modal-content">
          <div className="installation-description">
            <AlertTriangle size={16} />
            <p>
              This MCP server requires manual installation. Follow the steps below to set it up, 
              then you can add it to your Claude configuration.
            </p>
          </div>

          <div className="installation-section">
            <h4>📋 Installation Steps</h4>
            <div className="installation-steps">
              {installationSteps.map((step, index) => (
                <div 
                  key={index} 
                  className={`installation-step ${completedSteps.has(index) ? 'completed' : ''}`}
                >
                  <div className="step-header">
                    <div className="step-number-container">
                      <button
                        onClick={() => toggleStepCompletion(index)}
                        className={`step-checkbox ${completedSteps.has(index) ? 'checked' : ''}`}
                      >
                        {completedSteps.has(index) && <CheckCircle size={16} />}
                      </button>
                      <span className="step-number">{index + 1}</span>
                    </div>
                    <div className="step-content">
                      <p className="step-description">{step.description}</p>
                      {step.workingDirectory && (
                        <p className="step-directory">
                          <strong>Working Directory:</strong> {step.workingDirectory}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="step-command">
                    <code>{step.command}</code>
                    <button
                      onClick={() => copyToClipboard(step.command, index)}
                      className="copy-button"
                      title="Copy command"
                    >
                      {copiedStep === index ? <CheckCircle size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                  
                  {step.requiresManualAction && (
                    <div className="manual-action-note">
                      <AlertTriangle size={14} />
                      <span>This step requires manual verification or additional configuration</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {environmentVars.length > 0 && (
            <div className="installation-section">
              <h4>🔑 Environment Variables</h4>
              <p>Configure these environment variables after installation:</p>
              <div className="env-vars-list">
                {environmentVars.map((envVar, index) => (
                  <div key={index} className="env-var-item">
                    <div className="env-var-header">
                      <code className="env-var-key">{envVar.key}</code>
                      {envVar.required && <span className="required-badge">Required</span>}
                    </div>
                    <p className="env-var-description">{envVar.description}</p>
                    <input
                      type={envVar.key.toLowerCase().includes('password') || 
                            envVar.key.toLowerCase().includes('token') || 
                            envVar.key.toLowerCase().includes('key') ? 'password' : 'text'}
                      placeholder={`Enter ${envVar.key}...`}
                      value={envValues[envVar.key] || ''}
                      onChange={(e) => setEnvValues(prev => ({
                        ...prev,
                        [envVar.key]: e.target.value
                      }))}
                      className="env-var-input"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="installation-section">
            <h4>⚙️ Final Claude Configuration</h4>
            <p>After completing the installation steps, add this to your Claude settings:</p>
            <div className="final-command">
              <code>
                claude mcp add {mcpName.toLowerCase()} {finalCommand.command} {finalCommand.args.join(' ')}
              </code>
              <button
                onClick={() => copyToClipboard(
                  `claude mcp add ${mcpName.toLowerCase()} ${finalCommand.command} ${finalCommand.args.join(' ')}`,
                  -1
                )}
                className="copy-button"
                title="Copy final command"
              >
                {copiedStep === -1 ? <CheckCircle size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="installation-modal-footer">
          <div className="installation-progress">
            <div className="progress-indicator">
              <CheckCircle 
                size={16} 
                className={allStepsCompleted ? 'progress-complete' : 'progress-incomplete'} 
              />
              <span>Steps: {completedSteps.size}/{installationSteps.length}</span>
            </div>
            <div className="progress-indicator">
              <CheckCircle 
                size={16} 
                className={requiredEnvVarsFilled ? 'progress-complete' : 'progress-incomplete'} 
              />
              <span>Required Env Vars</span>
            </div>
          </div>
          
          <div className="installation-actions">
            <button
              onClick={handleSaveAsTemplate}
              className="btn-secondary"
            >
              <FileText size={16} />
              Save as Template
            </button>
            <button
              onClick={onClose}
              className="btn-primary"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstallationInstructionModal;