// アプリケーションの状態を管理するクラス
class DrawingApp {
    constructor() {
        // DOM要素の参照
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasContainer = document.getElementById('canvas-container');
        this.dropArea = document.getElementById('drop-area');
        this.fileInput = document.getElementById('file-input');
        this.controls = document.getElementById('controls');
        this.statusBar = document.getElementById('status-bar');
        this.drawingModeIndicator = document.getElementById('drawing-mode-indicator');
        this.coordinatesDisplay = document.getElementById('coordinates');
        this.zoomLevelInput = document.getElementById('zoom-level');
        this.zoomValueDisplay = document.getElementById('zoom-value');
        this.lineWidthInput = document.getElementById('line-width');
        this.widthValueDisplay = document.getElementById('width-value');
        this.lineColorInput = document.getElementById('line-color');
        this.undoButton = document.getElementById('undo-button');
        this.redoButton = document.getElementById('redo-button');
        this.saveButton = document.getElementById('save-button');

        // 描画状態の初期化
        this.originalImage = null;
        this.zoomLevel = 100;
        this.lineWidth = 10;
        this.lineColor = '#000000';
        this.isDrawing = false;
        this.startPoint = null;
        this.currentPoint = null;
        this.history = [];
        this.redoStack = [];
        this.currentHistoryStep = null;
        this.imageLoaded = false;

        // イベントリスナーの設定
        this.setupEventListeners();
    }

    // イベントリスナーの設定
    setupEventListeners() {
        // ファイルドロップエリアのイベント
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.dropArea.addEventListener(eventName, this.preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.dropArea.addEventListener(eventName, () => {
                this.dropArea.classList.add('highlight');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.dropArea.addEventListener(eventName, () => {
                this.dropArea.classList.remove('highlight');
            }, false);
        });

        this.dropArea.addEventListener('drop', this.handleDrop.bind(this), false);
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this), false);

        // キャンバスのイベント
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        // ホイールイベントをドキュメント全体に適用（スクロール防止のためにpassive: falseを設定）
        document.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

        // コントロールのイベント
        this.zoomLevelInput.addEventListener('input', this.handleZoomChange.bind(this));
        this.lineWidthInput.addEventListener('input', this.handleLineWidthChange.bind(this));
        this.lineColorInput.addEventListener('input', this.handleColorChange.bind(this));
        this.undoButton.addEventListener('click', this.undo.bind(this));
        this.redoButton.addEventListener('click', this.redo.bind(this));
        this.saveButton.addEventListener('click', this.saveImage.bind(this));

        // キーボードショートカット
        document.addEventListener('keydown', this.handleKeyDown.bind(this));

        // ウィンドウのリサイズイベント
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    // デフォルトのイベント動作を防止
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // ドロップされたファイルを処理
    handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.handleFiles(files);
    }

    // ファイル選択を処理
    handleFileSelect(e) {
        const files = e.target.files;
        this.handleFiles(files);
    }

    // ファイルを処理
    handleFiles(files) {
        if (files.length === 0) return;
        
        const file = files[0];
        if (!file.type.match('image.*')) return;
        
        const reader = new FileReader();
        
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                // 新しい画像を開いた際に線の情報をリセット
                this.history = [];
                this.redoStack = [];
                this.isDrawing = false;
                this.startPoint = null;
                this.currentPoint = null;
                this.updateUndoRedoButtons();
                
                this.resetCanvas();
                this.showControls();
                this.imageLoaded = true;
            };
            img.src = e.target.result;
        };
        
        reader.readAsDataURL(file);
    }

    // キャンバスをリセット
    resetCanvas() {
        if (!this.originalImage) return;
        
        // キャンバスのサイズを設定
        const scaleFactor = this.zoomLevel / 100;
        this.canvas.width = this.originalImage.width * scaleFactor;
        this.canvas.height = this.originalImage.height * scaleFactor;
        
        // 画像を描画
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(
            this.originalImage, 
            0, 0, 
            this.originalImage.width, this.originalImage.height,
            0, 0,
            this.canvas.width, this.canvas.height
        );
        
        // 履歴内の線を再描画
        this.redrawLines();
        
        // canvas-containerのサイズを更新
        this.handleResize();
    }

    // 履歴内の線を再描画
    redrawLines() {
        if (this.history.length === 0) return;
        
        this.history.forEach(step => {
            this.drawLine(
                step.startPoint.x * (this.zoomLevel / step.zoomLevel),
                step.startPoint.y * (this.zoomLevel / step.zoomLevel),
                step.endPoint.x * (this.zoomLevel / step.zoomLevel),
                step.endPoint.y * (this.zoomLevel / step.zoomLevel),
                step.lineWidth,  // 線の幅はdrawLineメソッド内で拡大率を考慮する
                step.lineColor
            );
        });
    }

    // コントロールを表示
    showControls() {
        // 画像ロード部分を非表示にしない
        // this.dropArea.style.display = 'none';
        this.controls.style.display = 'flex';
        this.canvasContainer.style.display = 'block';
        this.drawingModeIndicator.style.display = 'block'; // 描画モードインジケーターを表示
        this.statusBar.style.display = 'flex';
        this.saveButton.disabled = false; // 保存ボタンを有効化
        
        // 描画モードインジケーターは常に表示されるので、ここでは制御しない
        
        // 初回ロード時にもstatus-barの位置を正しく設定
        if (this.canvas.height) {
            this.statusBar.style.marginTop = `${this.canvas.height + 20}px`;
        }
        
        this.handleResize();
    }

    // マウスダウンイベントを処理
    handleMouseDown(e) {
        if (!this.imageLoaded) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.isDrawing) {
            // 描画モードの場合、線を確定
            this.isDrawing = false;
            this.endPoint = { x, y };
            
            // 履歴に追加
            this.history.push({
                startPoint: this.startPoint,
                endPoint: this.endPoint,
                lineWidth: this.lineWidth,
                lineColor: this.lineColor,
                zoomLevel: this.zoomLevel
            });
            
            // やり直しスタックをクリア
            this.redoStack = [];
            this.updateUndoRedoButtons();
            
            this.drawingModeIndicator.textContent = '始点をクリック　Ctrl＋マウスホイール：拡大率';
            this.drawingModeIndicator.classList.remove('active');
        } else {
            // 非描画モードの場合、描画を開始
            this.isDrawing = true;
            this.startPoint = { x, y };
            this.currentPoint = { x, y };
            
            this.drawingModeIndicator.textContent = '終点をクリック　Ctrl＋マウスホイール：線幅';
            this.drawingModeIndicator.classList.add('active');
        }
    }

    // マウス移動イベントを処理
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 座標表示を更新
        this.coordinatesDisplay.textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
        
        if (this.isDrawing) {
            this.currentPoint = { x, y };
            this.redrawCanvas();
        }
    }

    // マウスアップイベントを処理
    handleMouseUp(e) {
        // 描画モードの場合は何もしない（クリックで確定するため）
    }

    // ホイールイベントを処理
    handleWheel(e) {
    
        // Ctrlキーを押したときのみ有効
        if (!e.ctrlKey) return;
        
        // マウスホイールでのスクロールを防止
        e.preventDefault();
        
        // 画像がロードされていない場合は何もしない
        if (!this.imageLoaded) return;
        
        if (this.isDrawing) {
            // 描画モード中はライン幅を変更
            const delta = Math.sign(e.deltaY) * -1;
            const newWidth = Math.max(1, Math.min(100, this.lineWidth + delta));
            this.lineWidth = newWidth;
            this.lineWidthInput.value = newWidth;
            this.widthValueDisplay.textContent = newWidth;
            this.redrawCanvas();
        } else {
            // 非描画モード中はズームレベルを変更（直感的な変化量）
            const delta = Math.sign(e.deltaY) * -1; // -1は上方向、+1は下方向
            let newZoom = this.zoomLevel;
            
            // 現在の拡大率に応じて変化量を計算
            // 小さい値では小さく、大きい値では大きく変化
            let zoomChange;
            
            if (this.zoomLevel < 100) {
                // 100%未満の場合は5%ずつ変化
                zoomChange = 5;
            } else if (this.zoomLevel < 200) {
                // 100%〜200%の場合は10%ずつ変化
                zoomChange = 10;
            } else if (this.zoomLevel < 500) {
                // 200%〜500%の場合は25%ずつ変化
                zoomChange = 25;
            } else if (this.zoomLevel < 1000) {
                // 500%〜1000%の場合は50%ずつ変化
                zoomChange = 50;
            } else {
                // 1000%以上の場合は現在の拡大率の10%ずつ変化
                zoomChange = Math.max(100, Math.round(this.zoomLevel * 0.1));
            }
            
            if (delta > 0) {
                // 拡大
                newZoom = Math.min(5000, this.zoomLevel + zoomChange);
            } else {
                // 縮小
                newZoom = Math.max(1, this.zoomLevel - zoomChange);
            }
            
            this.zoomLevel = newZoom;
            this.zoomLevelInput.value = newZoom;
            this.zoomValueDisplay.textContent = newZoom;
            this.resetCanvas();
        }
    }
    
    // 画像を保存
    saveImage() {
        if (!this.imageLoaded) return;
        
        // 一時的なキャンバスを作成して元の画像サイズで描画
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.originalImage.width;
        tempCanvas.height = this.originalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 元の画像を描画
        tempCtx.drawImage(this.originalImage, 0, 0);
        
        // 全ての線を元の画像サイズに合わせて描画
        this.history.forEach(step => {
            const scaleFactor = 100 / step.zoomLevel;
            tempCtx.beginPath();
            tempCtx.moveTo(
                step.startPoint.x * scaleFactor,
                step.startPoint.y * scaleFactor
            );
            tempCtx.lineTo(
                step.endPoint.x * scaleFactor,
                step.endPoint.y * scaleFactor
            );
            tempCtx.lineWidth = step.lineWidth;
            tempCtx.strokeStyle = step.lineColor;
            tempCtx.lineCap = 'butt';
            tempCtx.stroke();
        });
        
        // ダウンロード用のリンクを作成
        const link = document.createElement('a');
        link.download = 'censored-image.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    // ズーム変更を処理
    handleZoomChange(e) {
        this.zoomLevel = parseInt(e.target.value);
        this.zoomValueDisplay.textContent = this.zoomLevel;
        this.resetCanvas();
    }

    // 線幅変更を処理
    handleLineWidthChange(e) {
        this.lineWidth = parseInt(e.target.value);
        this.widthValueDisplay.textContent = this.lineWidth;
        if (this.isDrawing) {
            this.redrawCanvas();
        }
    }

    // 色変更を処理
    handleColorChange(e) {
        this.lineColor = e.target.value;
        if (this.isDrawing) {
            this.redrawCanvas();
        }
    }

    // キャンバスを再描画
    redrawCanvas() {
        if (!this.isDrawing || !this.startPoint || !this.currentPoint) return;
        
        this.resetCanvas();
        this.drawLine(
            this.startPoint.x,
            this.startPoint.y,
            this.currentPoint.x,
            this.currentPoint.y,
            this.lineWidth,
            this.lineColor
        );
    }

    // 線を描画
    drawLine(startX, startY, endX, endY, width, color) {
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        // 線の幅を拡大率に応じて調整
        this.ctx.lineWidth = width * (this.zoomLevel / 100);
        this.ctx.strokeStyle = color;
        this.ctx.lineCap = 'butt';
        this.ctx.stroke();
    }

    // キーボードショートカットを処理
    handleKeyDown(e) {
        // Ctrl+Z: 元に戻す
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            this.undo();
        }
        
        // Ctrl+Y: やり直す
        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            this.redo();
        }
        
        // Ctrl+S: 画像を保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (this.imageLoaded && !this.saveButton.disabled) {
                this.saveImage();
            }
        }
        
        // Ctrl+O: ファイルを開く
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            // ファイル入力要素をクリックしたように振る舞う
            this.fileInput.click();
        }
    }

    // 元に戻す
    undo() {
        if (this.history.length === 0) return;
        
        const step = this.history.pop();
        this.redoStack.push(step);
        this.resetCanvas();
        this.updateUndoRedoButtons();
    }

    // やり直す
    redo() {
        if (this.redoStack.length === 0) return;
        
        const step = this.redoStack.pop();
        this.history.push(step);
        this.resetCanvas();
        this.updateUndoRedoButtons();
    }

    // 元に戻す/やり直すボタンの状態を更新
    updateUndoRedoButtons() {
        this.undoButton.disabled = this.history.length === 0;
        this.redoButton.disabled = this.redoStack.length === 0;
    }

    // リサイズイベントを処理
    handleResize() {
        if (this.imageLoaded) {
            // canvas-containerのサイズをキャンバスサイズに正確に合わせる
            // 即時に反映されるようにタイムアウトを使用
            setTimeout(() => {
                this.canvasContainer.style.width = `${this.canvas.width}px`;
                this.canvasContainer.style.height = `${this.canvas.height}px`;
                // コンテナの外側のスタイルも調整
                this.canvasContainer.style.padding = '0';
                this.canvasContainer.style.overflow = 'visible';
                
                // CSSで定義された中央揃えの設定を使用する
                // position: absoluteはそのまま使用し、一貫性を保つ
            }, 0);
            
            // status-barが正しく表示されるように、適切な位置に設定
            this.statusBar.style.marginTop = `${this.canvas.height + 20}px`;
        }
    }
}

// DOMが読み込まれたらアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new DrawingApp();
});
