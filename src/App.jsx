import { useState } from 'react';
import './App.css';

// Example front-end for validating signed XML/XAdES documents.
//
// Two modes:
// - "backend" (default): talks to the local example backend
//   (exemplo-java-integracao-validacao-xml, POST /api/xml/validate/form). The
//   API token stays server-side, in the backend's own application.properties
//   — never exposed to the browser. This is the pattern customers should
//   actually use in production.
// - "direct" (optional): calls the SolidSign API directly from the browser.
//   Convenient for a quick manual check, but it exposes the Bearer token in
//   client-side JS — only use this with a short-lived/test token.
//
// The report below is intentionally plain (a table of key facts), not a
// reproduction of the Portal SolidSign validator's UI.

const DEFAULT_BACKEND_URL = 'http://localhost:8096';

const statusClass = (indication) => {
  if (indication === 'PASSED' || indication === 'TOTAL_PASSED') return 'success';
  if (indication === 'INDETERMINATE') return 'warning';
  return 'error';
};

const statusLabel = (indication) => {
  if (indication === 'PASSED' || indication === 'TOTAL_PASSED') return 'VALID';
  if (indication === 'INDETERMINATE') return 'INDETERMINATE';
  return 'INVALID';
};

const fmtDate = (v) => (v ? new Date(v).toLocaleString() : 'N/A');
const val = (v) => (v === null || v === undefined || v === '' ? 'N/A' : String(v));

function Row({ label, value }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{val(value)}</td>
    </tr>
  );
}

function DocumentReport({ doc, fileName }) {
  const signatures = doc.signatures || [];
  return (
    <div className="report">
      <div className={`report-status ${statusClass(doc.globalIndication)}`}>
        {fileName}: {statusLabel(doc.globalIndication)}
      </div>
      <table className="report-table">
        <tbody>
          <Row label="Signature count" value={doc.qtyOfSignatures ?? signatures.length} />
        </tbody>
      </table>

      {signatures.map((sig, i) => {
        const cert = sig.signingCertificateValidation || {};
        const revoc = cert.revocationValidation || {};
        return (
          <div key={i}>
            <div className="sig-title">Signature {i + 1} — {statusLabel(sig.indication)}</div>
            <table className="report-table">
              <tbody>
                <Row label="Signer" value={cert.commonName} />
                <Row label="E-mail" value={cert.email} />
                <Row label="Signing time" value={fmtDate(sig.signingTime)} />
                <Row label="Profile" value={sig.complianceProfile} />
                <Row label="Certificate status" value={cert.certificateStatus} />
                <Row label="Certificate valid until" value={cert.notAfter ? new Date(cert.notAfter).toLocaleDateString() : 'N/A'} />
                <Row label="Revocation indication" value={revoc.indication} />
                <Row label="Data intact" value={sig.dataIntact !== false ? 'yes' : 'no'} />
              </tbody>
            </table>
          </div>
        );
      })}
      {signatures.length === 0 && <p style={{ color: '#777', fontSize: '0.85rem' }}>No signatures found in this document.</p>}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('backend'); // 'backend' | 'direct'
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [baseUrl, setBaseUrl] = useState('https://www.solidsign.com.br');
  const [authorization, setAuthorization] = useState('');
  const [documents, setDocuments] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);

    if (documents.length === 0) { setError('Select at least one signed XML.'); return; }
    if (mode === 'direct' && !authorization.trim()) { setError('Enter the Bearer token.'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      let url;
      if (mode === 'backend') {
        documents.forEach((f) => fd.append('document', f));
        url = `${backendUrl.replace(/\/$/, '')}/api/xml/validate/form`;
      } else {
        documents.forEach((f, i) => fd.append(`signedFile[${i}]`, f));
        url = `${baseUrl.replace(/\/$/, '')}/solidsign/dsig/validation/verify-xml`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: mode === 'direct'
          ? { Authorization: authorization.startsWith('Bearer ') ? authorization : `Bearer ${authorization}` }
          : undefined,
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = text;
        try { msg = JSON.parse(text)?.message || text; } catch { /* keep raw text */ }
        setError(msg || `HTTP error ${res.status}`);
        return;
      }

      setResult(await res.json());
      setSelectedIdx(0);
    } catch (err) {
      setError(`Request failed (${mode === 'backend' ? backendUrl : baseUrl}): ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const docs = result?.documentValidations || [];

  return (
    <div className="page">
      <h1>Validate XML/XAdES (React example)</h1>
      <p className="subtitle">
        Example front-end for <code>exemplo-java-integracao-validacao-xml</code>. By default it
        talks to that local backend, which holds the API credentials server-side — the
        recommended integration pattern. The "call API directly" mode is only for quick manual
        checks and puts your token in the browser.
      </p>

      <form onSubmit={submit} className="form">
        <fieldset>
          <legend>1. Connection</legend>
          <div className="mode-toggle">
            <label><input type="radio" checked={mode === 'backend'} onChange={() => setMode('backend')} /> Via example backend (default)</label>
            <label><input type="radio" checked={mode === 'direct'} onChange={() => setMode('direct')} /> Direct to SolidSign API (optional)</label>
          </div>
          {mode === 'backend' ? (
            <label>Backend URL
              <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} placeholder={DEFAULT_BACKEND_URL} />
            </label>
          ) : (
            <>
              <label>SolidSign API base URL
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://www.solidsign.com.br" />
              </label>
              <label>Bearer token
                <input value={authorization} onChange={(e) => setAuthorization(e.target.value)} placeholder="eyJhbGciOi..." />
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>2. Document(s)</legend>
          <label>Signed XML(s)
            <input type="file" accept=".xml,text/xml,application/xml" multiple onChange={(e) => setDocuments(Array.from(e.target.files))} />
          </label>
        </fieldset>

        <button type="submit" disabled={loading}>{loading ? 'Validating…' : 'VALIDATE'}</button>
      </form>

      {error && <div className="box error">{error}</div>}

      {docs.length > 0 && (
        <>
          {docs.length > 1 && (
            <div className="mode-toggle" style={{ marginTop: 16, flexWrap: 'wrap' }}>
              {docs.map((d, i) => (
                <label key={i}>
                  <input type="radio" checked={i === selectedIdx} onChange={() => setSelectedIdx(i)} />
                  {documents[i]?.name || `Document ${i + 1}`}
                </label>
              ))}
            </div>
          )}
          <DocumentReport doc={docs[selectedIdx]} fileName={documents[selectedIdx]?.name || `document_${selectedIdx + 1}.xml`} />
        </>
      )}
    </div>
  );
}
