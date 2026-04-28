export default function Footer() {
  return (
    <footer style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "2rem 0", marginTop: "4rem" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", textAlign: "center", color: "#475569", lineHeight: 1.6 }}>
        <h3 style={{ color: "#1e293b", marginBottom: "0.5rem", fontWeight: 600 }}>
          Hệ thống thi thử tốt nghiệp THPT môn Toán
        </h3>
        <p>
          Nhà phát triển: <strong>Thầy Hoàng Blue</strong> - Trường TH, THCS - THPT Hoàng Gia (Royal School)
        </p>
        <div style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
          <span>
            Góp ý phát triển:{" "}
            <a href="tel:0962543567" style={{ color: "#3b82f6", textDecoration: "none" }}>
              0962 543 567
            </a>
          </span>
          <span style={{ margin: "0 1rem" }}>|</span>
          <span>
            Email:{" "}
            <a href="mailto:mrhoangblue@gmail.com" style={{ color: "#3b82f6", textDecoration: "none" }}>
              mrhoangblue@gmail.com
            </a>
          </span>
        </div>
        <p style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "#94a3b8" }}>
          &copy; 2026 Trang web lưu hành nội bộ.
        </p>
      </div>
    </footer>
  );
}
