type Props = {
  onSyncStudents: () => Promise<number>;
  onSyncpersonel: () => Promise<number>;
  onSyncBooks: () => Promise<number>;
};

const SyncPanel = ({ onSyncStudents, onSyncpersonel, onSyncBooks }: Props) => {
  const handle = async (action: () => Promise<number>, label: string) => {
    try {
      const count = await action();
      alert(`${label} tamamlandı. ${count} kayıt güncellendi.`);
    } catch (error) {
      alert((error as Error).message);
    }
  };

  return (
    <div className="card">
      <h2>Excel/CSV Senkronizasyonu</h2>
      <div className="toolbar">
        <button className="primary" onClick={() => handle(onSyncStudents, "Öğrenci aktarımı")}>
          Öğrencileri İçe Aktar
        </button>
        <button className="primary" onClick={() => handle(onSyncpersonel, "Personel aktarımı")}>
          Personelleri İçe Aktar
        </button>
        <button className="primary" onClick={() => handle(onSyncBooks, "Kitap aktarımı")}>
          Kitapları İçe Aktar
        </button>
      </div>
      <p style={{ color: "#475569" }}>
        storage klasöründeki CSV dosyaları güncellendiğinde bu butonlarla JSON veritabanını senkronize edebilirsin.
      </p>
    </div>
  );
};

export default SyncPanel;
