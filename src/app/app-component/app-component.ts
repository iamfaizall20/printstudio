import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostBinding, OnInit, ViewChild } from '@angular/core';
import jsPDF from 'jspdf';
declare const cv: any;

interface CopyOption {
  value: number;
  available: boolean;
}

interface CnicSlot {
  id: number;
  imageSrc: string | null;
  imageCropped: string | null;
  confirmed: boolean;
  label: string;
  side: 'front' | 'back';
  copies: number;
}

@Component({
  selector: 'app-app-component',
  imports: [CommonModule],
  templateUrl: './app-component.html',
  styleUrl: './app-component.css',
})
export class AppComponent implements OnInit {

  @ViewChild('frontInput') frontInput!: ElementRef<HTMLInputElement>;
  @ViewChild('backInput') backInput!: ElementRef<HTMLInputElement>;

  @HostBinding('class.light-theme') isLightTheme = false;

  readonly SLOTS_PER_PAGE = 8;
  readonly COPY_OPTIONS = [2, 4, 6, 8];

  cnicDesigns: CnicSlot[] = [
    { id: 1, imageSrc: null, imageCropped: null, confirmed: false, label: 'CNIC 1 — Front', side: 'front', copies: 4 },
    { id: 2, imageSrc: null, imageCropped: null, confirmed: false, label: 'CNIC 1 — Back', side: 'back', copies: 4 },
  ];

  private uploadTargetSlotId: number = 1;

  showUploadDialog = false;
  showPreviewDialog = false;
  activePreviewTab = 0;

  mobileMenuOpen = false;

  copyOptions: CopyOption[] = [];
  copiesDropdownOpen = false;

  // ── Crop state ──────────────────────────────────────────────────────────────
  isCropping = false;
  cropLoading = false;
  // cropBox is only non-null once the user has dragged far enough
  cropBox: { [key: string]: string } | null = null;
  // raw pixel start point relative to the overlay element
  private cropStart: { x: number; y: number } | null = null;
  // whether the mouse button is currently held down during a drag
  private isDragging = false;

  isLoading = false;
  loaderMessage = 'Processing...';

  // ─── Getters ───────────────────────────────────────────────────────────────

  get confirmedDesigns(): CnicSlot[] {
    return this.cnicDesigns.filter(s => s.confirmed);
  }

  get confirmedFronts(): CnicSlot[] {
    return this.confirmedDesigns.filter(s => s.side === 'front');
  }

  get confirmedBacks(): CnicSlot[] {
    return this.confirmedDesigns.filter(s => s.side === 'back');
  }

  get anyConfirmed(): boolean {
    return this.cnicDesigns.some(s => s.confirmed);
  }

  get hasAnyUploaded(): boolean {
    return this.cnicDesigns.some(s => s.imageSrc !== null);
  }

  get uploadedCount(): number {
    return this.cnicDesigns.filter(s => s.imageSrc !== null).length;
  }

  get totalClaimedSlots(): number {
    return this.getCnicPairs()
      .filter(pair => pair.some(s => s.imageSrc))
      .reduce((sum, _, pi) => sum + this.getPairCopies(pi), 0);
  }

  get slotsOverLimit(): boolean {
    return this.totalClaimedSlots > this.SLOTS_PER_PAGE;
  }

  get hasBothSides(): boolean {
    return this.confirmedFronts.length > 0 && this.confirmedBacks.length > 0;
  }

  get hasFrontOnly(): boolean {
    return this.confirmedFronts.length > 0 && this.confirmedBacks.length === 0;
  }

  get hasBackOnly(): boolean {
    return this.confirmedBacks.length > 0 && this.confirmedFronts.length === 0;
  }

  get activeSlot(): CnicSlot | null {
    return this.cnicDesigns[this.activePreviewTab] ?? null;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const saved = localStorage.getItem('printstudio-theme');
    if (saved === 'light') this.isLightTheme = true;
    this.refreshCopyOptions();
  }

  // ─── Theme ─────────────────────────────────────────────────────────────────

  toggleTheme(): void {
    this.isLightTheme = !this.isLightTheme;
    localStorage.setItem('printstudio-theme', this.isLightTheme ? 'light' : 'dark');
    this.mobileMenuOpen = false;
  }

  // ─── Mobile menu ───────────────────────────────────────────────────────────

  toggleMobileMenu(): void { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu(): void { this.mobileMenuOpen = false; }

  // ─── Upload dialog ─────────────────────────────────────────────────────────

  openUploadDialog(): void {
    this.mobileMenuOpen = false;
    this.showUploadDialog = true;
    document.body.style.overflow = 'hidden';
  }

  closeUploadDialog(): void {
    this.showUploadDialog = false;
    document.body.style.overflow = '';
  }

  triggerSlotUpload(slotId: number): void {
    this.uploadTargetSlotId = slotId;
    const input = document.getElementById('dynamic-file-input') as HTMLInputElement;
    if (input) { input.value = ''; input.click(); }
  }

  onDynamicFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.readFileIntoSlot(input.files[0], this.uploadTargetSlotId);
  }

  onDrop(event: DragEvent, slotId: number): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.readFileIntoSlot(file, slotId);
  }

  private readFileIntoSlot(file: File, slotId: number): void {
    const slot = this.cnicDesigns.find(s => s.id === slotId);
    if (!slot) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      slot.imageSrc = e.target?.result as string;
      slot.imageCropped = null;
      slot.confirmed = false;
      this.refreshCopyOptions();
    };
    reader.readAsDataURL(file);
  }

  // ─── Pair management ───────────────────────────────────────────────────────

  getCnicPairs(): CnicSlot[][] {
    const pairs: CnicSlot[][] = [];
    for (let i = 0; i < this.cnicDesigns.length; i += 2) {
      const pair: CnicSlot[] = [this.cnicDesigns[i]];
      if (this.cnicDesigns[i + 1]) pair.push(this.cnicDesigns[i + 1]);
      pairs.push(pair);
    }
    return pairs;
  }

  addPair(): void {
    if (this.cnicDesigns.length >= 8) return;
    const pairNum = this.getCnicPairs().length + 1;
    const baseId = Date.now();
    this.cnicDesigns.push(
      { id: baseId, imageSrc: null, imageCropped: null, confirmed: false, label: `CNIC ${pairNum} — Front`, side: 'front', copies: 4 },
      { id: baseId + 1, imageSrc: null, imageCropped: null, confirmed: false, label: `CNIC ${pairNum} — Back`, side: 'back', copies: 4 }
    );
    this.refreshCopyOptions();
  }

  removePair(pairIndex: number): void {
    if (this.getCnicPairs().length <= 1) return;
    const startIndex = pairIndex * 2;
    this.cnicDesigns.splice(startIndex, 2);
    for (let i = 0; i < this.cnicDesigns.length; i++) {
      const pairNum = Math.floor(i / 2) + 1;
      this.cnicDesigns[i].label = `CNIC ${pairNum} — ${this.cnicDesigns[i].side === 'front' ? 'Front' : 'Back'}`;
    }
    this.refreshCopyOptions();
  }

  setPairCopies(pairIndex: number, copies: number): void {
    const startIndex = pairIndex * 2;
    if (this.cnicDesigns[startIndex]) this.cnicDesigns[startIndex].copies = copies;
    if (this.cnicDesigns[startIndex + 1]) this.cnicDesigns[startIndex + 1].copies = copies;
  }

  getPairCopies(pairIndex: number): number {
    return this.cnicDesigns[pairIndex * 2]?.copies ?? 4;
  }

  // ─── Upload confirm ────────────────────────────────────────────────────────

  confirmUpload(): void {
    if (!this.cnicDesigns.some(s => s.imageSrc)) return;
    this.closeUploadDialog();
    setTimeout(() => {
      this.showPreviewDialog = true;
      this.activePreviewTab = 0;
      document.body.style.overflow = 'hidden';
    }, 150);
  }

  // ─── Preview / crop dialog ─────────────────────────────────────────────────

  closePreviewDialog(): void {
    this.showPreviewDialog = false;
    this.isCropping = false;
    this.cropBox = null;
    this.isDragging = false;
    this.cropStart = null;
    document.body.style.overflow = '';
  }

  switchTab(index: number): void {
    this.activePreviewTab = index;
    this.isCropping = false;
    this.cropBox = null;
    this.isDragging = false;
    this.cropStart = null;
  }

  activeTabHasCrop(): boolean { return !!this.activeSlot?.imageCropped; }

  // ─── Auto crop ─────────────────────────────────────────────────────────────

  autoCrop(): void {
    const slot = this.activeSlot;
    if (!slot?.imageSrc) return;

    this.cropLoading = true;

    const img = new Image();
    img.src = slot.imageSrc;

    img.onload = () => {
      // @ts-ignore
      const cvCheck = setInterval(() => {
        // @ts-ignore
        if (window.cv && cv.Mat) {
          clearInterval(cvCheck);
          this.runOpenCVAutoCrop(img, slot);
        }
      }, 100);
    };
  }
  private runOpenCVAutoCrop(img: HTMLImageElement, slot: CnicSlot): void {

    // @ts-ignore
    let src = cv.imread(img);

    // @ts-ignore
    let gray = new cv.Mat();
    // @ts-ignore
    let blur = new cv.Mat();
    // @ts-ignore
    let edges = new cv.Mat();
    // @ts-ignore
    let contours = new cv.MatVector();
    // @ts-ignore
    let hierarchy = new cv.Mat();

    // Convert to grayscale
    // @ts-ignore
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Blur to remove noise
    // @ts-ignore
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

    // Edge detection
    // @ts-ignore
    cv.Canny(blur, edges, 75, 200);

    // Find contours
    // @ts-ignore
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestContour = null;

    for (let i = 0; i < contours.size(); i++) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);

      if (area > maxArea) {

        let approx = new cv.Mat();
        // @ts-ignore
        cv.approxPolyDP(cnt, approx, 0.02 * cv.arcLength(cnt, true), true);

        // We want rectangle (CNIC shape)
        if (approx.rows === 4) {
          bestContour = approx;
          maxArea = area;
        }
      }
    }

    // If nothing detected → fallback
    if (!bestContour) {
      this.fallbackCenterCrop(img, slot);
      this.cropLoading = false;
      return;
    }

    // For now (safe version) → enhanced crop
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0);

    // Simple improvement (you can upgrade to warpPerspective later)
    const croppedCanvas = document.createElement('canvas');
    const w = img.width * 0.85;
    const h = img.height * 0.85;

    croppedCanvas.width = w;
    croppedCanvas.height = h;

    const cctx = croppedCanvas.getContext('2d')!;
    cctx.drawImage(canvas,
      img.width * 0.07,
      img.height * 0.07,
      w,
      h,
      0, 0, w, h
    );

    slot.imageCropped = croppedCanvas.toDataURL('image/jpeg', 0.95);

    // cleanup
    src.delete(); gray.delete(); blur.delete();
    edges.delete(); contours.delete(); hierarchy.delete();

    this.cropLoading = false;
  }

  private fallbackCenterCrop(img: HTMLImageElement, slot: CnicSlot): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const cropW = img.width * 0.9;
    const cropH = img.height * 0.85;

    canvas.width = cropW;
    canvas.height = cropH;

    ctx.drawImage(
      img,
      img.width * 0.05,
      img.height * 0.075,
      cropW,
      cropH,
      0, 0,
      cropW,
      cropH
    );

    slot.imageCropped = canvas.toDataURL('image/jpeg', 0.92);
  }
  private applyCropSimulated(src: string, slot: CnicSlot, done?: () => void): void {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const cropW = img.width * 0.9;
      const cropH = img.height * 0.85;
      canvas.width = cropW;
      canvas.height = cropH;
      canvas.getContext('2d')!.drawImage(
        img,
        img.width * 0.05, img.height * 0.075,
        cropW, cropH,
        0, 0, cropW, cropH
      );
      slot.imageCropped = canvas.toDataURL('image/jpeg', 0.92);
      if (done) done();
    };
    img.onerror = () => { if (done) done(); };
    img.src = src;
  }

  // ─── Manual crop ───────────────────────────────────────────────────────────

  /**
   * Toggles manual crop mode. Clicking "Manual Crop" only activates the
   * crosshair cursor — no box appears until the user actually drags.
   */
  toggleManualCrop(): void {
    this.isCropping = !this.isCropping;
    // Always clear the previous box when toggling
    this.cropBox = null;
    this.isDragging = false;
    this.cropStart = null;
  }

  /**
   * Called on mousedown — records where the drag started.
   * Does NOT create a crop box yet; that happens in moveCrop.
   */
  startCrop(e: MouseEvent | TouchEvent): void {
    if (!this.isCropping) return;
    e.preventDefault();

    const point = this.getPoint(e);
    const overlay = e.currentTarget as HTMLElement;
    const rect = overlay.getBoundingClientRect();

    this.cropStart = {
      x: point.x - rect.left,
      y: point.y - rect.top,
    };

    this.isDragging = true;
    this.cropBox = null;
  }

  private getPoint(e: MouseEvent | TouchEvent) {
    if ('touches' in e && e.touches.length) {
      return {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }

    return {
      x: (e as MouseEvent).clientX,
      y: (e as MouseEvent).clientY,
    };
  }
  /**
   * Called on mousemove — draws the selection box only while dragging.
   */
  moveCrop(e: MouseEvent | TouchEvent): void {
    if (!this.isCropping || !this.isDragging || !this.cropStart) return;
    e.preventDefault();

    const point = this.getPoint(e);
    const overlay = e.currentTarget as HTMLElement;
    const rect = overlay.getBoundingClientRect();

    const currentX = Math.max(0, Math.min(point.x - rect.left, rect.width));
    const currentY = Math.max(0, Math.min(point.y - rect.top, rect.height));

    const x = Math.min(this.cropStart.x, currentX);
    const y = Math.min(this.cropStart.y, currentY);
    const w = Math.abs(currentX - this.cropStart.x);
    const h = Math.abs(currentY - this.cropStart.y);

    if (w > 8 || h > 8) {
      this.cropBox = {
        left: x + 'px',
        top: y + 'px',
        width: w + 'px',
        height: h + 'px',
      };
    }
  }
  /**
   * Called on mouseup — applies the crop and exits crop mode.
   */
  endCrop(e: MouseEvent | TouchEvent): void {
    if (!this.isCropping || !this.isDragging) return;

    this.isDragging = false;

    if (this.cropBox && this.activeSlot?.imageSrc) {
      this.applyManualCrop(
        this.activeSlot.imageSrc,
        this.activeSlot,
        e.currentTarget as HTMLElement
      );
    }

    this.isCropping = false;
    this.cropStart = null;
    this.cropBox = null;
  }

  /**
   * Applies the crop box selection to the actual image using canvas.
   * Uses the overlay element's bounding rect to correctly map screen
   * pixels back to natural image coordinates.
   *
   * @param src        - original image data URL
   * @param slot       - the CnicSlot to update
   * @param overlayEl  - the .crop-overlay div (used for accurate coordinate mapping)
   */
  private applyManualCrop(src: string, slot: CnicSlot, overlayEl: HTMLElement): void {
    if (!this.cropBox) return;

    // Find the <img> inside the overlay so we know its rendered dimensions
    const imgEl = overlayEl.querySelector('.preview-main-img') as HTMLImageElement | null;
    if (!imgEl) return;

    const imgRect = imgEl.getBoundingClientRect();
    const overlayRect = overlayEl.getBoundingClientRect();

    // Offset of the <img> relative to the overlay (handles object-fit: contain padding)
    const imgOffsetX = imgRect.left - overlayRect.left;
    const imgOffsetY = imgRect.top - overlayRect.top;

    // The rendered size of the image element
    const renderedW = imgRect.width;
    const renderedH = imgRect.height;

    // Crop box coordinates are relative to the overlay; translate to image-relative coords
    const boxLeft = parseFloat(this.cropBox['left']) - imgOffsetX;
    const boxTop = parseFloat(this.cropBox['top']) - imgOffsetY;
    const boxW = parseFloat(this.cropBox['width']);
    const boxH = parseFloat(this.cropBox['height']);

    // Clamp to image bounds
    const clampedLeft = Math.max(0, boxLeft);
    const clampedTop = Math.max(0, boxTop);
    const clampedW = Math.min(boxW, renderedW - clampedLeft);
    const clampedH = Math.min(boxH, renderedH - clampedTop);

    if (clampedW < 10 || clampedH < 10) return;

    const img = new Image();
    img.onload = () => {
      // Scale factors from rendered size → natural image size
      const scaleX = img.naturalWidth / renderedW;
      const scaleY = img.naturalHeight / renderedH;

      const naturalX = clampedLeft * scaleX;
      const naturalY = clampedTop * scaleY;
      const naturalW = clampedW * scaleX;
      const naturalH = clampedH * scaleY;

      const canvas = document.createElement('canvas');
      canvas.width = naturalW;
      canvas.height = naturalH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, naturalX, naturalY, naturalW, naturalH, 0, 0, naturalW, naturalH);
      slot.imageCropped = canvas.toDataURL('image/jpeg', 0.95);
      slot.confirmed = false;
    };
    img.src = src;
  }

  resetCrop(): void {
    if (this.activeSlot) this.activeSlot.imageCropped = null;
    this.cropBox = null;
    this.isDragging = false;
    this.cropStart = null;
  }

  // ─── Confirm preview ───────────────────────────────────────────────────────

  confirmPreview(): void {
    this.cnicDesigns.forEach(s => { if (s.imageSrc) s.confirmed = true; });
    this.showPreviewDialog = false;
    this.isCropping = false;
    this.cropBox = null;
    this.isDragging = false;
    this.cropStart = null;
    document.body.style.overflow = '';
    this.loaderMessage = 'Building your layout...';
    this.isLoading = true;
    setTimeout(() => { this.isLoading = false; }, 700);
  }

  // ─── Copy options (legacy compat) ──────────────────────────────────────────

  refreshCopyOptions(): void {
    const hasImages = this.cnicDesigns.some(s => s.imageSrc !== null);
    this.copyOptions = [2, 4, 6, 8].map(v => ({ value: v, available: hasImages }));
  }

  selectCopies(val: number): void {
    this.copiesDropdownOpen = false;
  }

  toggleCopiesDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.copiesDropdownOpen = !this.copiesDropdownOpen;
  }

  closeCopiesDropdown(): void { this.copiesDropdownOpen = false; }

  // ─── Page slot builders ────────────────────────────────────────────────────

  private buildPageSlots(
    designs: CnicSlot[]
  ): Array<{ imageSrc: string | null; label: string; isEmpty: boolean; slotIndex: number }> {
    const sequence: CnicSlot[] = [];
    for (const design of designs) {
      for (let c = 0; c < design.copies; c++) {
        sequence.push(design);
      }
    }

    return Array.from({ length: this.SLOTS_PER_PAGE }, (_, i) => {
      if (i >= sequence.length) {
        return { imageSrc: null, label: '', isEmpty: true, slotIndex: i };
      }
      const design = sequence[i];
      return {
        imageSrc: design.imageCropped || design.imageSrc,
        label: design.label,
        isEmpty: false,
        slotIndex: i,
      };
    });
  }

  getFrontPageSlots(): Array<{ imageSrc: string | null; label: string; isEmpty: boolean; slotIndex: number }> {
    return this.buildPageSlots(this.confirmedFronts);
  }

  getBackPageSlots(): Array<{ imageSrc: string | null; label: string; isEmpty: boolean; slotIndex: number }> {
    return this.buildPageSlots(this.confirmedBacks);
  }

  async downloadPDF(): Promise<void> {
    if (!this.anyConfirmed) return;
    this.mobileMenuOpen = false;
    this.loaderMessage = 'Generating PDF…';
    this.isLoading = true;

    try {
      const cols = 2, rows = 4;
      const pageW = 210, pageH = 297;
      const margin = 10, gap = 5;
      const printW = pageW - margin * 2;
      const printH = pageH - margin * 2;

      const cellW = (printW - gap * (cols - 1)) / cols;
      const cellH = (printH - gap * (rows - 1)) / rows;

      const cnicRatio = 85.6 / 54;
      let imgW = cellW;
      let imgH = imgW / cnicRatio;
      if (imgH > cellH) { imgH = cellH; imgW = imgH * cnicRatio; }
      const offsetX = (cellW - imgW) / 2;
      const offsetY = (cellH - imgH) / 2;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const drawPage = (designs: CnicSlot[], pageLabel: string) => {
        const sequence: CnicSlot[] = [];
        for (const design of designs) {
          for (let c = 0; c < design.copies; c++) sequence.push(design);
        }
        if (sequence.length === 0) return;

        for (let i = 0; i < this.SLOTS_PER_PAGE; i++) {
          if (i >= sequence.length) continue;
          const design = sequence[i];
          const src = design.imageCropped || design.imageSrc;
          if (!src) continue;

          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = margin + col * (cellW + gap) + offsetX;
          const y = margin + row * (cellH + gap) + offsetY;
          const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          pdf.addImage(src, fmt, x, y, imgW, imgH);
        }

        pdf.setFontSize(7);
        pdf.setTextColor(180, 180, 180);
        pdf.text(pageLabel, pageW / 2, pageH - 3, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
      };

      const fronts = this.confirmedFronts;
      const backs = this.confirmedBacks;

      if (fronts.length > 0) {
        drawPage(fronts, 'Front Side — PrintStudio');
      }
      if (backs.length > 0) {
        if (fronts.length > 0) pdf.addPage();
        drawPage(backs, 'Back Side — PrintStudio');
      }
      if (fronts.length === 0 && backs.length === 0) {
        drawPage(this.confirmedDesigns, 'CNIC Layout — PrintStudio');
      }

      const date = new Date().toISOString().slice(0, 10);
      pdf.save(`CNIC_Layout_${date}.pdf`);

    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Please try again.');
    } finally {
      this.isLoading = false;
      this.resetApp();
    }
  }

  resetApp(): void {
    this.cnicDesigns = [
      { id: 1, imageSrc: null, imageCropped: null, confirmed: false, label: 'CNIC 1 — Front', side: 'front', copies: 4 },
      { id: 2, imageSrc: null, imageCropped: null, confirmed: false, label: 'CNIC 1 — Back', side: 'back', copies: 4 },
    ];

    this.showPreviewDialog = false;
    this.showUploadDialog = false;
    this.activePreviewTab = 0;
    this.isCropping = false;
    this.cropBox = null;
    this.isDragging = false;
    this.cropStart = null;
    this.mobileMenuOpen = false;

    this.refreshCopyOptions();
    document.body.style.overflow = '';
  }
  goToGithub() {
    window.open('https://github.com/iamfaizall20', '_blank');
  }
}