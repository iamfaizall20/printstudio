import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostBinding, OnInit, ViewChild } from '@angular/core';
import jsPDF from 'jspdf';

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

  isCropping = false;
  cropLoading = false;
  cropBox: { [key: string]: string } | null = null;
  private cropStart: { x: number; y: number } | null = null;

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
    document.body.style.overflow = '';
  }

  switchTab(index: number): void {
    this.activePreviewTab = index;
    this.isCropping = false;
    this.cropBox = null;
  }

  activeTabHasCrop(): boolean { return !!this.activeSlot?.imageCropped; }

  // ─── Auto crop ─────────────────────────────────────────────────────────────

  autoCrop(): void {
    const slot = this.activeSlot;
    if (!slot?.imageSrc) return;
    this.cropLoading = true;
    this.applyCropSimulated(slot.imageSrc, slot, () => { this.cropLoading = false; });
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

  toggleManualCrop(): void {
    this.isCropping = !this.isCropping;
    if (!this.isCropping) this.cropBox = null;
  }

  startCrop(e: MouseEvent): void {
    if (!this.isCropping) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.cropStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    // Reset the crop box on new drag start
    this.cropBox = null;
  }

  moveCrop(e: MouseEvent): void {
    if (!this.isCropping || !this.cropStart) return;
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(this.cropStart.x, currentX);
    const y = Math.min(this.cropStart.y, currentY);
    const w = Math.abs(currentX - this.cropStart.x);
    const h = Math.abs(currentY - this.cropStart.y);

    // Only show box once the user has dragged a meaningful distance
    if (w > 5 || h > 5) {
      this.cropBox = {
        left: x + 'px',
        top: y + 'px',
        width: w + 'px',
        height: h + 'px',
      };
    }
  }

  endCrop(e: MouseEvent): void {
    if (!this.isCropping || !this.cropStart || !this.activeSlot?.imageSrc) return;

    if (this.cropBox) {
      this.applyManualCrop(this.activeSlot.imageSrc, this.activeSlot);
    }

    this.isCropping = false;
    this.cropStart = null;
    this.cropBox = null;
  }

  private applyManualCrop(src: string, slot: CnicSlot): void {
    if (!this.cropBox) return;

    const imgEl = document.querySelector('.preview-main-img') as HTMLImageElement;
    if (!imgEl) return;

    const img = new Image();
    img.onload = () => {
      const rect = imgEl.getBoundingClientRect();
      const scaleX = img.naturalWidth / rect.width;
      const scaleY = img.naturalHeight / rect.height;

      const cropX = parseFloat(this.cropBox!['left']) * scaleX;
      const cropY = parseFloat(this.cropBox!['top']) * scaleY;
      const cropW = parseFloat(this.cropBox!['width']) * scaleX;
      const cropH = parseFloat(this.cropBox!['height']) * scaleY;

      if (cropW < 10 || cropH < 10) return;

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      slot.imageCropped = canvas.toDataURL('image/jpeg', 0.95);
      slot.confirmed = false;
    };
    img.src = src;
  }

  resetCrop(): void {
    if (this.activeSlot) this.activeSlot.imageCropped = null;
    this.cropBox = null;
  }

  // ─── Confirm preview ───────────────────────────────────────────────────────

  confirmPreview(): void {
    this.cnicDesigns.forEach(s => { if (s.imageSrc) s.confirmed = true; });
    this.showPreviewDialog = false;
    this.isCropping = false;
    this.cropBox = null;
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

  // ─── PDF Download ──────────────────────────────────────────────────────────

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

  // ─── Reset ─────────────────────────────────────────────────────────────────

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
    this.mobileMenuOpen = false;

    this.refreshCopyOptions();
    document.body.style.overflow = '';
  }
}