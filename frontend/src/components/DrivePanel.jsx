import { useState } from 'react';
import { driveApi } from '../api/endpoints';
import { Spinner, EmptyState } from './Feedback';

export function DrivePanel() {
  const [query, setQuery] = useState('');
  const [files, setFiles] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    try {
      const res = await driveApi.search(query);
      setFiles(res.data);
    } catch (err) {
      setSearchError(err.message || 'Drive search failed');
    } finally {
      setSearching(false);
    }
  };

  const runUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const res = await driveApi.upload(uploadFile);
      setUploadResult(res.data);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="drive-panel">
      <section>
        <h3>Search Drive files</h3>
        <p className="text-muted">
          Only finds files this app created or that you've explicitly opened with it (least-privilege scope).
        </p>
        <form className="inline-form" onSubmit={runSearch}>
          <input type="text" placeholder="e.g. resume" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={searching}>
            Search
          </button>
        </form>

        {searching && <Spinner label="Searching Drive…" />}
        {searchError && <div className="banner banner-error">{searchError}</div>}
        {files && files.length === 0 && <EmptyState title="No matching files found" />}
        {files && files.length > 0 && (
          <ul className="drive-file-list">
            {files.map((f) => (
              <li key={f.id}>
                <a href={f.webViewLink} target="_blank" rel="noreferrer">
                  {f.name}
                </a>
                <span className="text-muted"> · {f.mimeType}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Upload a file</h3>
        <form className="inline-form" onSubmit={runUpload}>
          <input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
          <button type="submit" className="btn btn-primary" disabled={uploading || !uploadFile}>
            {uploading ? 'Uploading…' : 'Upload to Drive'}
          </button>
        </form>
        {uploadError && <div className="banner banner-error">{uploadError}</div>}
        {uploadResult && (
          <div className="banner banner-success">
            Uploaded "{uploadResult.name}".{' '}
            {uploadResult.webViewLink && (
              <a href={uploadResult.webViewLink} target="_blank" rel="noreferrer">
                Open in Drive
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
