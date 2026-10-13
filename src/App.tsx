import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  defaultReceipt,
  drawReceipt,
  createPrinterCanvas,
  type LogoAsset,
  type ReceiptState
} from './receipt';
import { encodeEscPosRaster, MAX_FEED_BEFORE_CUT, MAX_PRINT_WIDTH, MIN_PRINT_WIDTH, type CutMode } from './escpos';
import { disconnectBluetooth, hasBluetoothSupport, requestBluetoothConnection, writeBluetooth } from './bluetooth';
import { disconnectSerial, hasSerialSupport, requestSerialConnection, writeEscPos, type SerialConnection } from './serial';
import type { BluetoothConnection } from './bluetooth';
import { Button as ParkButton } from './components/ui/button';
import { createPersistedEditor, MAX_LOGO_DATA_URL_LENGTH, readPersistedEditor, writePersistedEditor } from './persistence';
import './styles.css';

type ImportResponse = {
  event?: {
    eventName: string;
    venue: string;
    address: string;
    googleMapsLink: string;
    eventDatetime: string;
    eventDeadline: string;
    open: boolean | null;
    maxCapacity: number | null;
  };
  attendeeNumber?: string | number | null;
  error?: string;
};

export function App() {
  const [receipt, setReceipt] = useState<ReceiptState>(defaultReceipt);
  const [referenceLogo, setReferenceLogo] = useState<LogoAsset | null>(null);
  const [uploadedLogo, setUploadedLogo] = useState<LogoAsset | null>(null);
  const [fontFileName, setFontFileName] = useState('IBM Plex Sans同梱 / IBM Plex Sans JP同梱');
  const [importUrl, setImportUrl] = useState('');
  const [includeAttendeeSerial, setIncludeAttendeeSerial] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [printWidth, setPrintWidth] = useState(384);
  const [rasterMargin, setRasterMargin] = useState(0);
  const [cutMode, setCutMode] = useState<CutMode>('full');
  const [feedBeforeCut, setFeedBeforeCut] = useState(0);
  const [rotateForPrint, setRotateForPrint] = useState(false);
  const [chunkSize, setChunkSize] = useState(180);
  const [serialConnection, setSerialConnection] = useState<SerialConnection | BluetoothConnection | null>(null);
  const [serialMessage, setSerialMessage] = useState('未接続');
  const [serialError, setSerialError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [fontReady, setFontReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [persistenceMessage, setPersistenceMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printAbortRef = useRef<AbortController | null>(null);
  const serialSupported = typeof navigator !== 'undefined' && hasSerialSupport();
  const bluetoothSupported = typeof navigator !== 'undefined' && hasBluetoothSupport();
  const activeLogo = receipt.logoMode === 'upload' ? uploadedLogo : referenceLogo;
  const offkaiImportAvailable = import.meta.env.DEV || import.meta.env.VITE_STATIC_DEPLOY !== 'true';

  useEffect(() => {
    const stored = readPersistedEditor();
    if (stored) {
      setReceipt(stored.receipt);
      setPrintWidth(stored.settings.printWidth);
      setRasterMargin(stored.settings.rasterMargin);
      setCutMode(stored.settings.cutMode);
      setFeedBeforeCut(stored.settings.feedBeforeCut);
      setRotateForPrint(stored.settings.rotateForPrint);
      setChunkSize(stored.settings.chunkSize);
      setIncludeAttendeeSerial(stored.settings.includeAttendeeSerial);
      if (stored.logo) {
        const image = new Image();
        image.onload = () => {
          setUploadedLogo({
            source: image,
            width: stored.logo?.width || image.naturalWidth,
            height: stored.logo?.height || image.naturalHeight,
            dataUrl: stored.logo?.dataUrl
          });
        };
        image.onerror = () => {
          setReceipt((current) => ({ ...current, logoMode: 'reference' }));
        };
        image.src = stored.logo.dataUrl;
      }
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!document.fonts) {
      setFontReady(true);
      return;
    }
    let active = true;
    Promise.all([
      document.fonts.load('400 60px "IBM Plex Sans Local"'),
      document.fonts.load('700 60px "IBM Plex Sans Local"'),
      document.fonts.load('400 60px "IBM Plex Sans JP Local"'),
      document.fonts.load('700 60px "IBM Plex Sans JP Local"')
    ]).finally(() => {
      if (active) {
        setFontReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setReferenceLogo({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        crop: { x: 20, y: 220, width: 520, height: 300 }
      });
    };
    image.src = `${import.meta.env.BASE_URL}reference/ikizuraibu_2L.png`;
  }, []);

  useEffect(() => {
    if (fontReady && canvasRef.current) {
      drawReceipt(canvasRef.current, receipt, activeLogo);
    }
  }, [activeLogo, fontReady, receipt]);

  useEffect(() => {
    if (!restored) {
      return;
    }
    const saved = writePersistedEditor(
      createPersistedEditor(
        receipt,
        {
          printWidth,
          rasterMargin,
          cutMode,
          feedBeforeCut,
          rotateForPrint,
          chunkSize,
          includeAttendeeSerial
        },
        uploadedLogo
      )
    );
    const logoTooLarge = Boolean(uploadedLogo?.dataUrl && uploadedLogo.dataUrl.length > MAX_LOGO_DATA_URL_LENGTH);
    setPersistenceMessage(
      saved
        ? logoTooLarge
          ? '本文を自動保存済み（ロゴは容量超過）'
          : '自動保存済み'
        : '保存容量不足のため自動保存できません'
    );
  }, [chunkSize, cutMode, feedBeforeCut, includeAttendeeSerial, printWidth, rasterMargin, receipt, restored, rotateForPrint, uploadedLogo]);

  function updateReceipt<K extends keyof ReceiptState>(key: K, value: ReceiptState[K]) {
    setReceipt((current) => ({ ...current, [key]: value }));
  }

  function updateNotice(index: number, value: string) {
    setReceipt((current) => ({
      ...current,
      notices: current.notices.map((notice, noticeIndex) => (noticeIndex === index ? value : notice))
    }));
  }

  function updatePrintWidth(value: number) {
    const next = Number.isFinite(value)
      ? Math.max(MIN_PRINT_WIDTH, Math.min(MAX_PRINT_WIDTH, Math.round(value / 8) * 8))
      : 384;
    setPrintWidth(next);
    setRasterMargin((current) => Math.min(current, Math.floor((next - 8) / 2)));
  }

  function updateRasterMargin(value: number) {
    const next = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    setRasterMargin(Math.min(next, Math.floor((printWidth - 8) / 2)));
  }

  function updateFeedBeforeCut(value: number) {
    const next = Number.isFinite(value) ? Math.max(0, Math.min(MAX_FEED_BEFORE_CUT, Math.round(value))) : 0;
    setFeedBeforeCut(next);
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setExportError('ロゴ画像を読み込めませんでした。');
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setExportError('ロゴ画像を読み込めませんでした。');
        return;
      }
      const dataUrl = reader.result;
      const image = new Image();
      image.onload = () => {
        setUploadedLogo({
          source: image,
          width: image.naturalWidth,
          height: image.naturalHeight,
          dataUrl
        });
        updateReceipt('logoMode', 'upload');
      };
      image.onerror = () => setExportError('ロゴ画像を読み込めませんでした。');
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function handleFontUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const font = new FontFace('ReceiptCustom', await file.arrayBuffer());
      await font.load();
      document.fonts.add(font);
      updateReceipt('fontFamily', 'ReceiptCustom');
      setFontFileName(file.name);
      setExportError('');
    } catch {
      setExportError('フォントを読み込めませんでした。対応形式は woff / woff2 / ttf / ttc / otf です。');
    }
  }

  async function handleImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offkaiImportAvailable) {
      setImportError('GitHub Pagesの静的公開版ではOffkai取込を利用できません。ローカル開発サーバーで実行してください。');
      setImportMessage('');
      return;
    }
    setImporting(true);
    setImportError('');
    setImportMessage('');
    try {
      const response = await fetch('/api/offkai-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl, includeAttendeeSerial })
      });
      const payload = (await response.json()) as ImportResponse;
      if (!response.ok || !payload.event) {
        throw new Error(payload.error || 'Offkaiからイベント情報を取得できませんでした。');
      }
      const eventData = payload.event;
      const nextValues: Partial<ReceiptState> = {
        subtitle: eventData.eventName,
        dateVenue: `${formatEventDate(eventData.eventDatetime)} ${eventData.venue}`
      };
      if (includeAttendeeSerial && payload.attendeeNumber !== null && payload.attendeeNumber !== undefined) {
        nextValues.serial = String(payload.attendeeNumber);
      }
      setReceipt((current) => ({ ...current, ...nextValues }));
      setImportUrl('');
      setImportMessage(
        includeAttendeeSerial && payload.attendeeNumber !== null && payload.attendeeNumber !== undefined
          ? 'イベント情報と整理番号を反映しました。'
          : 'イベント情報を反映しました。整理番号は変更していません。'
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Offkaiからイベント情報を取得できませんでした。');
    } finally {
      setImporting(false);
    }
  }

  async function handlePngExport() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    setExportError('');
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) {
      setExportError('PNGを書き出せませんでした。');
      return;
    }
    downloadBlob(blob, 'offkai-ticket.png');
  }

  function handleRawExport() {
    try {
      const canvas = createPrinterCanvas(receipt, activeLogo, printWidth, rotateForPrint, rasterMargin);
      const bytes = encodeEscPosRaster(canvas, { cutMode, feedBeforeCut });
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), 'offkai-ticket.escpos.bin');
      setExportError('');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'ESC/POSデータを書き出せませんでした。');
    }
  }

  async function handleSerialConnect() {
    setSerialError('');
    setSerialMessage('シリアルポートを選択してください。');
    try {
      const connection = await requestSerialConnection();
      setSerialConnection(connection);
      setSerialMessage('接続中: シリアルポート');
    } catch (error) {
      setSerialMessage('未接続');
      setSerialError(error instanceof Error ? error.message : 'シリアルポート接続に失敗しました。');
    }
  }

  async function handleBluetoothConnect() {
    setSerialError('');
    setSerialMessage('デバイスを選択してください。');
    try {
      const connection = await requestBluetoothConnection();
      connection.device.addEventListener('gattserverdisconnected', () => {
        setSerialConnection(null);
        setSerialMessage('切断されました');
      });
      setSerialConnection(connection);
      setSerialMessage(`接続中: ${connection.label}`);
    } catch (error) {
      setSerialMessage('未接続');
      setSerialError(error instanceof Error ? error.message : 'Bluetooth接続に失敗しました。');
    }
  }

  async function handleSerialDisconnect() {
    if (serialConnection?.kind === 'bluetooth') {
      disconnectBluetooth(serialConnection);
    } else {
      await disconnectSerial(serialConnection);
    }
    setSerialConnection(null);
    setSerialMessage('未接続');
  }

  async function handlePrint() {
    if (!serialConnection) {
      setSerialError('先にシリアルポートへ接続してください。');
      return;
    }
    const controller = new AbortController();
    printAbortRef.current = controller;
    setPrinting(true);
    setSerialError('');
    try {
      const canvas = createPrinterCanvas(receipt, activeLogo, printWidth, rotateForPrint, rasterMargin);
      const bytes = encodeEscPosRaster(canvas, { cutMode, feedBeforeCut });
      if (serialConnection.kind === 'bluetooth') {
        await writeBluetooth(serialConnection, bytes, chunkSize, controller.signal);
      } else {
        await writeEscPos(serialConnection, bytes, chunkSize, controller.signal);
      }
      setSerialMessage(`送信完了: ${bytes.length.toLocaleString()} bytes`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setSerialMessage('印刷をキャンセルしました。');
      } else {
        setSerialError(error instanceof Error ? error.message : '印刷に失敗しました。');
      }
    } finally {
      setPrinting(false);
      printAbortRef.current = null;
    }
  }

  function cancelPrint() {
    printAbortRef.current?.abort();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">RP</div>
          <div>
            <p className="eyebrow">OFFKAI / ESC-POS</p>
            <h1>Receipt Printer</h1>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="status-dot" />
          <span>ローカル編集</span>
          <span className="version-chip">BETA</span>
        </div>
      </header>

      <main className="workspace">
        <aside className="editor-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow pink">TICKET EDITOR</p>
              <h2>帳票をつくる</h2>
            </div>
            <div className="panel-heading-meta">
              <span className="dimension-chip">1819 × 685</span>
              {persistenceMessage && <span className="save-chip">{persistenceMessage}</span>}
            </div>
          </div>

          <section className="control-section">
            <SectionHeading number="01" title="Offkaiから読み込む" />
            <form className="import-form" onSubmit={handleImport}>
              <label className="field-label" htmlFor="offkai-url">
                参加者URL
              </label>
              <input
                id="offkai-url"
                className="text-input"
                type="url"
                value={importUrl}
                onChange={(event) => setImportUrl(event.target.value)}
                placeholder="https://offkai.idolbu.moe/?token=…"
                autoComplete="off"
                disabled={!offkaiImportAvailable}
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={includeAttendeeSerial}
                  onChange={(event) => setIncludeAttendeeSerial(event.target.checked)}
                  disabled={!offkaiImportAvailable}
                />
                <span>整理番号も反映する</span>
              </label>
              <ParkButton className="button button-primary" type="submit" disabled={importing || !importUrl.trim() || !offkaiImportAvailable}>
                {importing ? '取得中…' : 'イベント情報を取得'}
              </ParkButton>
              <p className="helper-text">
                {offkaiImportAvailable
                  ? 'イベント名・日時・会場だけを反映。URLは成功後に消去します。'
                  : '静的公開版ではサーバー経由のOffkai取込を停止しています。'}
              </p>
              {!offkaiImportAvailable && <p className="inline-error">ローカル開発サーバーで実行すると利用できます。</p>}
              {importMessage && <p className="inline-success">{importMessage}</p>}
              {importError && <p className="inline-error">{importError}</p>}
            </form>
          </section>

          <section className="control-section">
            <SectionHeading number="02" title="テキスト" />
            <Field label="見出し" value={receipt.heading} onChange={(value) => updateReceipt('heading', value)} />
            <Field label="サブ見出し" value={receipt.subtitle} onChange={(value) => updateReceipt('subtitle', value)} />
            <Field label="日時・会場" value={receipt.dateVenue} onChange={(value) => updateReceipt('dateVenue', value)} />
            <Field label="座席" value={receipt.seat} onChange={(value) => updateReceipt('seat', value)} />
            <Field label="整理番号" value={receipt.serial} onChange={(value) => updateReceipt('serial', value)} />
            <div className="field-group">
              <span className="field-label">注意書き</span>
              {receipt.notices.map((notice, index) => (
                <textarea
                  key={index}
                  className="text-input notice-input"
                  value={notice}
                  onChange={(event) => updateNotice(index, event.target.value)}
                  rows={1}
                />
              ))}
            </div>
          </section>

          <section className="control-section">
            <SectionHeading number="03" title="ロゴとフォント" />
            <label className="upload-button">
              <span>ロゴ画像をアップロード</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} />
            </label>
            <button
              className={`button button-secondary ${receipt.logoMode === 'reference' ? 'is-active' : ''}`}
              type="button"
              onClick={() => updateReceipt('logoMode', 'reference')}
            >
              見本ロゴに戻す
            </button>
            <RangeField
              label={`横位置 ${receipt.logoX}px`}
              min={0}
              max={320}
              step={1}
              value={receipt.logoX}
              onChange={(value) => updateReceipt('logoX', value)}
            />
            <RangeField
              label={`縦位置 ${receipt.logoY}px`}
              min={60}
              max={360}
              step={1}
              value={receipt.logoY}
              onChange={(value) => updateReceipt('logoY', value)}
            />
            <RangeField
              label={`拡大率 ${Math.round(receipt.logoScale * 100)}%`}
              min={0.5}
              max={1.4}
              step={0.01}
              value={receipt.logoScale}
              onChange={(value) => updateReceipt('logoScale', value)}
            />
            <label className="upload-button">
              <span>カスタムフォントを読み込む</span>
              <input type="file" accept=".woff,.woff2,.ttf,.ttc,.otf,font/woff,font/woff2,font/ttf,font/otf" onChange={handleFontUpload} />
            </label>
            <p className="helper-text font-name">{fontFileName}</p>
            <p className="helper-text">IBM Plex Sansを主フォントに、日本語と「○」はIBM Plex Sans JPへフォールバックします。</p>
          </section>

          <section className="control-section">
            <SectionHeading number="04" title="印刷設定" />
            <div className="two-column-fields">
              <label className="field-group">
                <span className="field-label">印字幅（dot）</span>
                <input className="text-input" type="number" min={MIN_PRINT_WIDTH} max={MAX_PRINT_WIDTH} step={8} value={printWidth} onChange={(event) => updatePrintWidth(Number(event.target.value))} />
              </label>
              <label className="field-group">
                <span className="field-label">向き</span>
                <select className="text-input" value={rotateForPrint ? 'rotate' : 'wide'} onChange={(event) => setRotateForPrint(event.target.value === 'rotate')}>
                  <option value="wide">横向き</option>
                  <option value="rotate">縦送りに回転</option>
                </select>
              </label>
            </div>
            <p className="helper-text">初期値384 dot（一般的な58mm幅）。内容は指定幅内に収めます。</p>
            <div className="two-column-fields">
              <label className="field-group">
                <span className="field-label">左右余白（dot）</span>
                <input className="text-input" type="number" min={0} max={Math.floor((printWidth - 8) / 2)} step={1} value={rasterMargin} onChange={(event) => updateRasterMargin(Number(event.target.value))} />
              </label>
              <label className="field-group">
                <span className="field-label">カット方式</span>
                <select className="text-input" value={cutMode} onChange={(event) => setCutMode(event.target.value as CutMode)}>
                  <option value="full">全切り（GS V65）</option>
                  <option value="partial">部分切り（GS V66）</option>
                  <option value="none">カットなし</option>
                </select>
              </label>
            </div>
            <label className="field-group">
              <span className="field-label">追加送り（ESC/POS n単位）</span>
              <input className="text-input" type="number" min={0} max={MAX_FEED_BEFORE_CUT} step={1} value={feedBeforeCut} onChange={(event) => updateFeedBeforeCut(Number(event.target.value))} />
            </label>
            <p className="helper-text">0は既定送り。カットありはGS V65/66、カットなしはESC Jで送り、単位は機種依存です。</p>
            <label className="field-group">
                <span className="field-label">シリアル分割サイズ</span>
                <input className="text-input" type="number" min={20} max={512} step={1} value={chunkSize} onChange={(event) => setChunkSize(Math.max(20, Math.min(512, Number(event.target.value) || 180)))} />
            </label>
            <div className="action-row">
              <button className="button button-secondary" type="button" onClick={handlePngExport}>
                PNGを書き出す
              </button>
              <button className="button button-secondary" type="button" onClick={handleRawExport}>
                ESC/POS .bin
              </button>
            </div>
            {exportError && <p className="inline-error">{exportError}</p>}
          </section>

          <section className="control-section serial-section">
            <SectionHeading number="05" title="プリンター接続" />
            <p className={`support-line ${serialSupported ? 'supported' : 'unsupported'}`}>
              <span className="support-dot" />
              {serialSupported ? 'Web Serialを利用できます' : 'このブラウザではWeb Serialを利用できません'}
            </p>
            <p className={`support-line ${bluetoothSupported ? 'supported' : 'unsupported'}`}>
              <span className="support-dot" />
              {bluetoothSupported ? 'Web Bluetooth (BLE) を利用できます' : 'このブラウザではWeb Bluetoothを利用できません'}
            </p>
            <div className="action-row">
              <button className="button button-primary" type="button" onClick={handleBluetoothConnect} disabled={!bluetoothSupported || Boolean(serialConnection)}>
                Bluetooth (BLE) で接続
              </button>
            </div>
            <div className="action-row">
              <button className="button button-primary" type="button" onClick={handleSerialConnect} disabled={!serialSupported || Boolean(serialConnection)}>
                シリアルポートを選択
              </button>
              <button className="button button-secondary" type="button" onClick={handleSerialDisconnect} disabled={!serialConnection}>
                切断
              </button>
            </div>
            <div className="connection-status">
              <span className={`status-dot ${serialConnection ? 'is-connected' : ''}`} />
              <span>{serialMessage}</span>
            </div>
            <button className="button button-print" type="button" onClick={printing ? cancelPrint : handlePrint} disabled={!printing && !serialConnection}>
              {printing ? '印刷を中止' : 'ESC/POSを送信'}
            </button>
            {serialError && <p className="inline-error">{serialError}</p>}
            <p className="helper-text">BLE接続はOSでペアリングせず、ブラウザの一覧から選択してください（他のアプリが接続中だと失敗します）。シリアルはOSでペアリング済みのSPPポート用（デスクトップ版Chromeのみ）です。実機がない場合は .bin を保存して送信内容を確認できます。</p>
          </section>
        </aside>

        <section className="preview-panel">
          <div className="preview-heading">
            <div>
              <p className="eyebrow pink">LIVE CANVAS</p>
              <h2>ライブプレビュー</h2>
            </div>
            <div className="preview-heading-meta">
              <span>共通レンダラー</span>
              <span className="live-chip"><span className="status-dot is-connected" /> LIVE</span>
            </div>
          </div>
          <div className="canvas-stage">
            <div className="canvas-frame">
              <canvas ref={canvasRef} className="receipt-canvas" aria-label="編集可能なチケットプレビュー" />
            </div>
            <div className="canvas-caption">
              <span>1819 × 685 px</span>
              <span>PNG / ESC-POS raster</span>
            </div>
          </div>
          <div className="preview-notes">
            <div className="note-card">
              <span className="note-index">A</span>
              <div>
                <strong>白黒ラスタ</strong>
                <p>同じCanvas描画から印刷用データを生成します。</p>
              </div>
            </div>
            <div className="note-card">
              <span className="note-index">B</span>
              <div>
                <strong>フォントについて</strong>
                <p>見本のフォント名は未特定。必要なら許諾済みファイルを読み込めます。</p>
              </div>
            </div>
            <div className="note-card">
              <span className="note-index">C</span>
              <div>
                <strong>ハードウェア</strong>
                <p>シリアルポート未接続時の送信は実行しません。</p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer-bar">
        <span>Receipt Printer / local-only workspace</span>
        <span>Park UI palette · #e4007f</span>
      </footer>
    </div>
  );
}

function SectionHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="section-heading">
      <span>{number}</span>
      <h3>{title}</h3>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-group">
      <span className="field-label">{label}</span>
      <input className="text-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function RangeField({
  label,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-group">
      <span className="field-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function formatEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}年${get('month')}月${get('day')}日（${get('weekday')}） ${get('hour')}:${get('minute')}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
