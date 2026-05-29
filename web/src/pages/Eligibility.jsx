import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Eligibility() {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.eligibility.get().then(d => {
      setContent(d.content);
      setOriginal(d.content);
      setUpdatedAt(d.updatedAt);
      setPath(d.path);
    }).catch(e => setMessage(`Error: ${e.message}`))
      .finally(() => setLoading(false));
  }, []);

  const dirty = content !== original;

  async function save() {
    setSaving(true); setMessage(null);
    try {
      const d = await api.eligibility.save(content);
      setOriginal(d.content);
      setUpdatedAt(d.updatedAt);
      setMessage('Saved. AI scoring and draft generation will use this updated profile immediately.');
    } catch (e) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function revert() {
    setContent(original);
    setMessage(null);
  }

  return (
    <div className="eligibility">
      <div className="page-header">
        <h1 className="page-title">Eligibility & Organisation Profile</h1>
        <div className="elig-actions">
          <button onClick={revert} disabled={!dirty || saving} className="btn-secondary">Revert</button>
          <button onClick={save} disabled={!dirty || saving} className="btn-primary">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <p className="page-sub">
        This is the canonical profile of Mary's House that grounds the AI ranker and draft generator.
        Edits here take effect immediately — the next opportunity scored or draft generated will use the latest version.
      </p>
      {path && <p className="page-sub" style={{ fontSize: 12 }}>File: <code>{path}</code>{updatedAt && <> · last updated {new Date(updatedAt).toLocaleString()}</>}</p>}

      {message && <div className={message.startsWith('Error') ? 'info-msg' : 'info-msg'}>{message}</div>}

      {loading ? <div className="empty">Loading…</div> :
        <textarea
          className="eligibility-editor"
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck
          placeholder="Markdown describing Mary's House mission, services, beneficiaries, funding needs, and eligibility signals…"
        />
      }
    </div>
  );
}
