import React, { useState, useEffect } from 'react';
import './DocumentationManager.css';

interface DocsStatus {
  installed: boolean;
  lastSync?: string;
  docsPath?: string;
  totalFiles?: number;
  gitInfo?: {
    currentCommit?: string;
    modifiedFiles?: number;
    remoteUrl?: string;
    error?: string;
  };
  message?: string;
  error?: string;
}

interface SearchResult {
  file: string;
  line: number;
  content: string;
  match: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  totalMatches: number;
}

interface ChangelogEntry {
  hash: string;
  date: string;
  message: string;
}

interface DocFile {
  path: string;
  name: string;
  size: number;
  lastModified: string;
}

const DocumentationManager: React.FC = () => {
  const [status, setStatus] = useState<DocsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [docFiles, setDocFiles] = useState<DocFile[]>([]);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'search' | 'files' | 'changelog'>('overview');

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/docs/status');
      const data = await response.json();
      setStatus(data);
      
      if (data.installed) {
        loadChangelog();
        loadDocFiles();
      }
    } catch (error) {
      console.error('Failed to load docs status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadChangelog = async () => {
    try {
      const response = await fetch('/api/docs/changelog?limit=10');
      const data = await response.json();
      setChangelog(data);
    } catch (error) {
      console.error('Failed to load changelog:', error);
    }
  };

  const loadDocFiles = async () => {
    try {
      const response = await fetch('/api/docs/list');
      const data = await response.json();
      setDocFiles(data);
    } catch (error) {
      console.error('Failed to load doc files:', error);
    }
  };

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const response = await fetch('/api/docs/install', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        await loadStatus();
      } else {
        alert('Installation failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Installation failed:', error);
      alert('Installation failed: ' + error);
    } finally {
      setInstalling(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/docs/sync', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        await loadStatus();
        if (data.updated) {
          loadChangelog();
          loadDocFiles();
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const response = await fetch(`/api/docs/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="documentation-manager">
        <div className="loading">Loading documentation status...</div>
      </div>
    );
  }

  return (
    <div className="documentation-manager">
      <h2>Claude Code Documentation</h2>
      
      {!status?.installed ? (
        <div className="not-installed">
          <div className="status-card">
            <h3>Documentation Mirror Not Installed</h3>
            <p>
              Install a local mirror of Claude Code documentation for faster access and offline use.
            </p>
            <button 
              onClick={handleInstall} 
              disabled={installing}
              className="install-button"
            >
              {installing ? 'Installing...' : 'Install Documentation Mirror'}
            </button>
          </div>
        </div>
      ) : (
        <div className="installed">
          <div className="tabs">
            <button 
              className={selectedTab === 'overview' ? 'active' : ''}
              onClick={() => setSelectedTab('overview')}
            >
              Overview
            </button>
            <button 
              className={selectedTab === 'search' ? 'active' : ''}
              onClick={() => setSelectedTab('search')}
            >
              Search
            </button>
            <button 
              className={selectedTab === 'files' ? 'active' : ''}
              onClick={() => setSelectedTab('files')}
            >
              Files ({docFiles.length})
            </button>
            <button 
              className={selectedTab === 'changelog' ? 'active' : ''}
              onClick={() => setSelectedTab('changelog')}
            >
              Changelog
            </button>
          </div>

          {selectedTab === 'overview' && (
            <div className="tab-content">
              <div className="status-grid">
                <div className="status-card">
                  <h3>Status</h3>
                  <div className="status-info">
                    <div className="status-item">
                      <span className="label">Last Sync:</span>
                      <span className="value">{status.lastSync || 'Never'}</span>
                    </div>
                    <div className="status-item">
                      <span className="label">Files Available:</span>
                      <span className="value">{status.totalFiles || 0}</span>
                    </div>
                    <div className="status-item">
                      <span className="label">Installation Path:</span>
                      <span className="value">{status.docsPath}</span>
                    </div>
                    {status.gitInfo?.currentCommit && (
                      <div className="status-item">
                        <span className="label">Current Version:</span>
                        <span className="value">{status.gitInfo.currentCommit}</span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={handleSync} 
                    disabled={syncing}
                    className="sync-button"
                  >
                    {syncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
                
                <div className="status-card">
                  <h3>Quick Actions</h3>
                  <div className="quick-actions">
                    <button onClick={() => setSelectedTab('search')}>
                      Search Documentation
                    </button>
                    <button onClick={() => setSelectedTab('files')}>
                      Browse Files
                    </button>
                    <button onClick={() => setSelectedTab('changelog')}>
                      View Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {selectedTab === 'search' && (
            <div className="tab-content">
              <div className="search-section">
                <h3>Search Documentation</h3>
                <form onSubmit={handleSearch} className="search-form">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for hooks, MCP, configuration..."
                    className="search-input"
                  />
                  <button type="submit" disabled={searching || !searchQuery.trim()}>
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </form>

                {searchResults && (
                  <div className="search-results">
                    <h4>
                      Found {searchResults.totalMatches} matches for "{searchResults.query}"
                    </h4>
                    {searchResults.results.length > 0 ? (
                      <div className="results-list">
                        {searchResults.results.map((result, index) => (
                          <div key={index} className="result-item">
                            <div className="result-header">
                              <span className="file-path">{result.file}</span>
                              <span className="line-number">Line {result.line}</span>
                            </div>
                            <div className="result-content">
                              {result.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="no-results">
                        No matches found for "{searchResults.query}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedTab === 'files' && (
            <div className="tab-content">
              <div className="files-section">
                <h3>Documentation Files</h3>
                {docFiles.length > 0 ? (
                  <div className="files-list">
                    {docFiles.map((file, index) => (
                      <div key={index} className="file-item">
                        <div className="file-info">
                          <span className="file-name">{file.name}</span>
                          <span className="file-path">{file.path}</span>
                        </div>
                        <div className="file-meta">
                          <span className="file-size">{formatFileSize(file.size)}</span>
                          <span className="file-date">{formatDate(file.lastModified)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-files">No documentation files found</div>
                )}
              </div>
            </div>
          )}

          {selectedTab === 'changelog' && (
            <div className="tab-content">
              <div className="changelog-section">
                <h3>Recent Changes</h3>
                {changelog.length > 0 ? (
                  <div className="changelog-list">
                    {changelog.map((entry, index) => (
                      <div key={index} className="changelog-item">
                        <div className="commit-info">
                          <span className="commit-hash">{entry.hash}</span>
                          <span className="commit-date">{entry.date}</span>
                        </div>
                        <div className="commit-message">{entry.message}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-changelog">No changelog available</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DocumentationManager;