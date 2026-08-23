export function Brand({ compact = false }) {
  return (
    <div className="brand">
      <img src="/mailmind-mark.svg" alt="" className="brand-mark" />
      {!compact && <span>MailMind</span>}
    </div>
  );
}

