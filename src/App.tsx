import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  defaultReceipt,
  drawReceipt,
  createPrinterCanvas,
  fitLogoPosition,
  MAX_LOGO_OFFSET_X,
  MAX_LOGO_OFFSET_Y,
  trimLogo,
  MAX_PADDING,
  type LogoAsset,
  type PrintRotation,
  type ReceiptState
} from './receipt';
import { encodeEscPosRaster, encodeEscPosRasterParts, encodeEscPosTextTest, MAX_FEED_BEFORE_CUT, MAX_HEATING, MAX_PRINT_WIDTH, MIN_PRINT_WIDTH, type CutMode } from './escpos';
import { hasBluetoothSupport, requestBluetoothConnection } from './bluetooth';
import type { PrinterConnection } from './printer';
import { Button as ParkButton } from './components/ui/button';
import { createPersistedEditor, DEFAULT_PADDING, MAX_LOGO_DATA_URL_LENGTH, readPersistedEditor, writePersistedEditor } from './persistence';
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
  const [paddingBefore, setPaddingBefore] = useState(DEFAULT_PADDING);
  const [paddingAfter, setPaddingAfter] = useState(DEFAULT_PADDING);
  const [cutMode, setCutMode] = useState<CutMode>('none');
  const [feedBeforeCut, setFeedBeforeCut] = useState(0);
  const [heating, setHeating] = useState(0);
  const [dither, setDither] = useState(true);
  const [printRotation, setPrintRotation] = useState<PrintRotation>('clockwise');
  const [chunkSize, setChunkSize] = useState(180);
  const [bluetoothName, setBluetoothName] = useState('');
  const [printerConnection, setPrinterConnection] = useState<PrinterConnection | null>(null);
  const [printerMessage, setPrinterMessage] = useState(IDLE_PRINTER_MESSAGE);
  const [printerError, setPrinterError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [fontReady, setFontReady] = useState(false);
  const [restored, setRestored] = useState(false);
  const [persistenceMessage, setPersistenceMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printAbortRef = useRef<AbortController | null>(null);
  const bluetoothSupported = typeof navigator !== 'undefined' && hasBluetoothSupport();
  const activeLogo = receipt.logoMode === 'upload' ? uploadedLogo : referenceLogo;
  const offkaiImportAvailable = import.meta.env.DEV || import.meta.env.VITE_STATIC_DEPLOY !== 'true';

  useEffect(() => {
    const stored = readPersistedEditor();
    if (stored) {
      setReceipt(stored.receipt);
      setPrintWidth(stored.settings.printWidth);
      setRasterMargin(stored.settings.rasterMargin);
      setPaddingBefore(stored.settings.paddingBefore);
      setPaddingAfter(stored.settings.paddingAfter);
      setCutMode(stored.settings.paperCut);
      setFeedBeforeCut(stored.settings.feedBeforeCut);
      setHeating(stored.settings.heating);
      setDither(stored.settings.dither);
      setPrintRotation(stored.settings.printRotation);
      setChunkSize(stored.settings.chunkSize);
      setBluetoothName(stored.settings.bluetoothName);
      setIncludeAttendeeSerial(stored.settings.includeAttendeeSerial);
      if (stored.logo) {
        const image = new Image();
        image.onload = () => {
          setUploadedLogo({ ...trimLogo(image), dataUrl: stored.logo?.dataUrl });
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
          paddingBefore,
          paddingAfter,
          paperCut: cutMode,
          feedBeforeCut,
          heating,
          dither,
          printRotation,
          chunkSize,
          bluetoothName,
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
  }, [bluetoothName, chunkSize, cutMode, dither, feedBeforeCut, heating, includeAttendeeSerial, paddingAfter, paddingBefore, printWidth, rasterMargin, receipt, restored, printRotation, uploadedLogo]);

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
        const logo = { ...trimLogo(image), dataUrl };
        setUploadedLogo(logo);
        setReceipt((current) => ({ ...current, ...fitLogoPosition(), logoMode: 'upload' }));
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
      const canvas = createPrinterCanvas(receipt, activeLogo, printWidth, printRotation, rasterMargin, paddingBefore, paddingAfter);
      const bytes = encodeEscPosRaster(canvas, { cutMode, feedBeforeCut, heating, dither });
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), 'offkai-ticket.escpos.bin');
      setExportError('');
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'ESC/POSデータを書き出せませんでした。');
    }
  }

  async function handlePrinterConnect(showAll = false) {
    setPrinterError('');
    setPrinterMessage('プリンターを選択してください');
    try {
      const connection = await requestBluetoothConnection(
        () => {
          printAbortRef.current?.abort();
          setPrinterConnection(null);
          setPrinterMessage(IDLE_PRINTER_MESSAGE);
          setPrinterError('プリンターとの接続が切れました。もう一度「印刷」を押すと再接続します。');
        },
        bluetoothName,
        showAll
      );
      setPrinterConnection(connection);
      if (connection.deviceName) {
        setBluetoothName(connection.deviceName);
      }
      setPrinterMessage(`接続中: ${connection.label}`);
      return connection;
    } catch (error) {
      setPrinterMessage(IDLE_PRINTER_MESSAGE);
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
        setPrinterError(error instanceof Error ? error.message : 'プリンターに接続できませんでした。電源を入れて再試行してください。');
      }
      return null;
    }
  }

  async function handlePrinterDisconnect() {
    await printerConnection?.disconnect();
    setPrinterConnection(null);
    setPrinterMessage(IDLE_PRINTER_MESSAGE);
  }

  async function handlePrint() {
    await sendToPrinter(() => {
      const canvas = createPrinterCanvas(receipt, activeLogo, printWidth, printRotation, rasterMargin, paddingBefore, paddingAfter);
      return encodeEscPosRasterParts(canvas, { cutMode, feedBeforeCut, heating, dither });
    });
  }

  async function handleTestPrint() {
    await sendToPrinter(() => encodeEscPosTextTest(heating));
  }

  async function sendToPrinter(encode: () => Uint8Array[]) {
    const connection = printerConnection ?? (await handlePrinterConnect());
    if (!connection) {
      return;
    }
    const controller = new AbortController();
    printAbortRef.current = controller;
    setPrinting(true);
    setPrinterError('');
    setPrinterMessage(`印刷中: ${connection.label}`);
    try {
      const parts = encode();
      await connection.write(parts, chunkSize, controller.signal);
      setPrinterMessage(`印刷しました: ${connection.label}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setPrinterMessage('印刷を中止しました');
      } else {
        setPrinterMessage(`接続中: ${connection.label}`);
        setPrinterError(error instanceof Error ? error.message : '印刷できませんでした。プリンターの電源と用紙を確認してください。');
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
          <h1>Receipt Printer</h1>
        </div>
      </header>

      <main className="workspace">
        <aside className="editor-panel">
          <div className="panel-heading">
            <h2>帳票をつくる</h2>
            {persistenceMessage && <span className="save-chip">{persistenceMessage}</span>}
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
              onClick={() =>
                setReceipt((current) => ({
                  ...current,
                  logoMode: 'reference',
                  logoOffsetX: defaultReceipt.logoOffsetX,
                  logoOffsetY: defaultReceipt.logoOffsetY,
                  logoScale: defaultReceipt.logoScale
                }))
              }
            >
              見本ロゴに戻す
            </button>
            <RangeField
              label={`横位置 ${receipt.logoOffsetX > 0 ? '+' : ''}${receipt.logoOffsetX}px（0で中央）`}
              min={-MAX_LOGO_OFFSET_X}
              max={MAX_LOGO_OFFSET_X}
              step={1}
              value={receipt.logoOffsetX}
              onChange={(value) => updateReceipt('logoOffsetX', value)}
            />
            <RangeField
              label={`縦位置 ${receipt.logoOffsetY > 0 ? '+' : ''}${receipt.logoOffsetY}px（0で中央）`}
              min={-MAX_LOGO_OFFSET_Y}
              max={MAX_LOGO_OFFSET_Y}
              step={1}
              value={receipt.logoOffsetY}
              onChange={(value) => updateReceipt('logoOffsetY', value)}
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
          </section>

          <section className="control-section">
            <SectionHeading number="04" title="印刷設定" />
            <div className="two-column-fields">
              <label className="field-group">
                <span className="field-label">前余白（mm）</span>
                <input className="text-input" type="number" min={0} max={MAX_PADDING / DOTS_PER_MM} step={1} value={paddingBefore / DOTS_PER_MM} onChange={(event) => setPaddingBefore(paddingFromMillimeters(event.target.value))} />
              </label>
              <label className="field-group">
                <span className="field-label">後余白（mm）</span>
                <input className="text-input" type="number" min={0} max={MAX_PADDING / DOTS_PER_MM} step={1} value={paddingAfter / DOTS_PER_MM} onChange={(event) => setPaddingAfter(paddingFromMillimeters(event.target.value))} />
              </label>
            </div>
            <details className="advanced-settings">
              <summary>詳細設定</summary>
              <div className="advanced-body">
                <label className="check-row">
                  <input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} />
                  <span>写真やロゴをディザリングで印刷する</span>
                </label>
                <div className="two-column-fields">
                  <label className="field-group">
                    <span className="field-label">向き</span>
                    <select className="text-input" value={printRotation} onChange={(event) => setPrintRotation(event.target.value as PrintRotation)}>
                      <option value="clockwise">右90°回転</option>
                      <option value="counterclockwise">左90°回転</option>
                    </select>
                  </label>
                  <label className="field-group">
                    <span className="field-label">印字幅（dot）</span>
                    <input className="text-input" type="number" min={MIN_PRINT_WIDTH} max={MAX_PRINT_WIDTH} step={8} value={printWidth} onChange={(event) => updatePrintWidth(Number(event.target.value))} />
                  </label>
                </div>
                <div className="two-column-fields">
                  <label className="field-group">
                    <span className="field-label">左右余白（dot）</span>
                    <input className="text-input" type="number" min={0} max={Math.floor((printWidth - 8) / 2)} step={1} value={rasterMargin} onChange={(event) => updateRasterMargin(Number(event.target.value))} />
                  </label>
                  <label className="field-group">
                    <span className="field-label">カット方式</span>
                    <select className="text-input" value={cutMode} onChange={(event) => setCutMode(event.target.value as CutMode)}>
                      <option value="none">カットなし</option>
                      <option value="full">全切り</option>
                      <option value="partial">部分切り</option>
                    </select>
                  </label>
                </div>
                <div className="two-column-fields">
                  <label className="field-group">
                    <span className="field-label">追加送り</span>
                    <input className="text-input" type="number" min={0} max={MAX_FEED_BEFORE_CUT} step={1} value={feedBeforeCut} onChange={(event) => updateFeedBeforeCut(Number(event.target.value))} />
                  </label>
                  <label className="field-group">
                    <span className="field-label">加熱時間（0で既定）</span>
                    <input className="text-input" type="number" min={0} max={MAX_HEATING} step={1} value={heating} onChange={(event) => setHeating(Math.max(0, Math.min(MAX_HEATING, Math.floor(Number(event.target.value)) || 0)))} />
                  </label>
                </div>
                <label className="field-group">
                  <span className="field-label">送信分割サイズ（最大182）</span>
                  <input className="text-input" type="number" min={20} max={512} step={1} value={chunkSize} onChange={(event) => setChunkSize(Math.max(20, Math.min(512, Number(event.target.value) || 180)))} />
                </label>
                <div className="action-row">
                  <button className="button button-secondary" type="button" onClick={handleTestPrint} disabled={printing || !printerConnection}>
                    テスト印字
                  </button>
                  <button className="button button-secondary" type="button" onClick={() => handlePrinterConnect(true)} disabled={!bluetoothSupported || Boolean(printerConnection)}>
                    全デバイスから接続
                  </button>
                </div>
                <div className="action-row">
                  <button className="button button-secondary" type="button" onClick={handlePngExport}>
                    PNGを保存
                  </button>
                  <button className="button button-secondary" type="button" onClick={handleRawExport}>
                    印刷データを保存
                  </button>
                </div>
                {exportError && <p className="inline-error">{exportError}</p>}
              </div>
            </details>
          </section>
        </aside>

        <section className="preview-panel">
          <div className="print-bar">
            <div className="print-status">
              <span className={`status-dot ${printerConnection ? 'is-connected' : ''}`} />
              <span>{printerMessage}</span>
            </div>
            <div className="print-actions">
              {printerConnection && (
                <button className="button button-secondary" type="button" onClick={handlePrinterDisconnect} disabled={printing}>
                  切断
                </button>
              )}
              <button className={`button ${printing ? 'button-secondary' : 'button-primary'}`} type="button" onClick={printing ? cancelPrint : handlePrint} disabled={!bluetoothSupported}>
                {printing ? '印刷を中止' : '印刷'}
              </button>
            </div>
          </div>
          {!bluetoothSupported && <p className="inline-error">このブラウザはBluetooth接続に対応していません。デスクトップ版Chromeで開いてください。</p>}
          {printerError && <p className="inline-error">{printerError}</p>}
          <div className="canvas-stage">
            <div className="canvas-frame">
              <canvas ref={canvasRef} className="receipt-canvas" aria-label="編集可能なチケットプレビュー" />
            </div>
          </div>
        </section>
      </main>
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

const DOTS_PER_MM = 8;
const IDLE_PRINTER_MESSAGE = '「印刷」を押すとプリンターを選べます';

function paddingFromMillimeters(value: string) {
  return Math.max(0, Math.min(MAX_PADDING, Math.round(Number(value) * DOTS_PER_MM) || 0));
}
