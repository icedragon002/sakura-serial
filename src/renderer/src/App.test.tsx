// Minimal test to verify React mounts
export default function TestApp() {
  return (
    <div style={{ padding: 40, color: 'white', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#ff7eb3' }}>Sakura Serial OK</h1>
      <p>React is rendering correctly.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        {['Dash','I2C','SPI','UART','CAN','1-Wire','GPIO','LA','BLE','Script'].map(t => (
          <button key={t} style={{ padding: '6px 12px', background: '#3d3160', color: '#eae0ff', border: '1px solid #3d2d5e', borderRadius: 6, cursor: 'pointer' }}>{t}</button>
        ))}
      </div>
    </div>
  )
}
