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

  cnicDesigns: CnicSlot[] = [
    { id: 1, imageSrc: null, imageCropped: null, confirmed: false, label: 'CNIC 1 — Front', side: 'front' },
    { id: 2, imageSrc: null, imageCropped: null, confirmed: false, label: 'CNIC 1 — Back', side: 'back' },
  ];

  private uploadTargetSlotId: number = 1;

  showUploadDialog = false;
  showPreviewDialog = false;
  activePreviewTab = 0;

  mobileMenuOpen = false;

  selectedCopies = 4;
  copyOptions: CopyOption[] = [];
  copiesDropdownOpen = false;

  isCropping = false;
  cropLoading = false;
  cropBox: { [key: string]: string } | null = null;
  private cropStart: { x: number; y: number } | null = null;

  isLoading = false;
  loaderMessage = 'Processing...';

  get confirmedDesigns(): CnicSlot[] {
    return this.cnicDesigns.filter(s => s.confirmed);
  }

  get anyConfirmed(): boolean {
    return this.cnicDesigns.some(s => s.confirmed);
  }

  get freeSlots(): number {
    return this.selectedCopies - this.confirmedDesigns.length;
  }

  get hasAnyUploaded(): boolean {
    return this.cnicDesigns.some(s => s.imageSrc !== null);
  }

  get uploadedCount(): number {
    return this.cnicDesigns.filter(s => s.imageSrc !== null).length;
  }

  get canAddDesign(): boolean {
    return this.freeSlots > 0 && this.cnicDesigns.length < 8;
  }

  ngOnInit(): void {
    const saved = localStorage.getItem('printstudio-theme');
    if (saved === 'light') this.isLightTheme = true;
    this.refreshCopyOptions();
  }

  toggleTheme(): void {
    this.isLightTheme = !this.isLightTheme;
    localStorage.setItem('printstudio-theme', this.isLightTheme ? 'light' : 'dark');
    this.mobileMenuOpen = false;
  }

  toggleMobileMenu(): void { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu(): void { this.mobileMenuOpen = false; }

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

  /** Returns slots grouped into pairs: [[front1, back1], [front2, back2], ...] */
  getCnicPairs(): CnicSlot[][] {
    const pairs: CnicSlot[][] = [];
    for (let i = 0; i < this.cnicDesigns.length; i += 2) {
      const pair: CnicSlot[] = [this.cnicDesigns[i]];
      if (this.cnicDesigns[i + 1]) pair.push(this.cnicDesigns[i + 1]);
      pairs.push(pair);
    }
    return pairs;
  }

  /** Add a full front+back pair at once */
  addPair(): void {
    if (this.cnicDesigns.length >= 8) return;
    const pairNum = this.getCnicPairs().length + 1;
    const baseId = Date.now();
    this.cnicDesigns.push(
      { id: baseId, imageSrc: null, imageCropped: null, confirmed: false, label: `CNIC ${pairNum} — Front`, side: 'front' },
      { id: baseId + 1, imageSrc: null, imageCropped: null, confirmed: false, label: `CNIC ${pairNum} — Back`, side: 'back' }
    );
    this.refreshCopyOptions();
  }

  /** Remove an entire pair (front+back) by pair index */
  removePair(pairIndex: number): void {
    if (this.getCnicPairs().length <= 1) return;
    const startIndex = pairIndex * 2;
    this.cnicDesigns.splice(startIndex, 2);
    // Re-label remaining pairs
    for (let i = 0; i < this.cnicDesigns.length; i++) {
      const pairNum = Math.floor(i / 2) + 1;
      this.cnicDesigns[i].label = `CNIC ${pairNum} — ${this.cnicDesigns[i].side === 'front' ? 'Front' : 'Back'}`;
    }
    this.refreshCopyOptions();
  }

  addDesignSlot(): void { this.addPair(); }

  removeDesignSlot(slotId: number): void {
    if (this.cnicDesigns.length <= 2) return;
    this.cnicDesigns = this.cnicDesigns.filter(s => s.id !== slotId);
    this.refreshCopyOptions();
  }

  confirmUpload(): void {
    if (!this.cnicDesigns.some(s => s.imageSrc)) return;
    this.closeUploadDialog();
    setTimeout(() => {
      this.showPreviewDialog = true;
      this.activePreviewTab = 0;
      document.body.style.overflow = 'hidden';
    }, 150);
  }

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

  get activeSlot(): CnicSlot | null {
    return this.cnicDesigns[this.activePreviewTab] ?? null;
  }

  activeTabHasCrop(): boolean { return !!this.activeSlot?.imageCropped; }

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
      canvas.width = cropW; canvas.height = cropH;
      canvas.getContext('2d')!.drawImage(img, img.width * 0.05, img.height * 0.075, cropW, cropH, 0, 0, cropW, cropH);
      slot.imageCropped = canvas.toDataURL('image/jpeg', 0.92);
      if (done) done();
    };
    img.onerror = () => { if (done) done(); };
    img.src = src;
  }

  toggleManualCrop(): void {
    this.isCropping = !this.isCropping;
    if (!this.isCropping) this.cropBox = null;
  }

  startCrop(e: MouseEvent): void {
    if (!this.isCropping) return;
    this.cropStart = { x: e.offsetX, y: e.offsetY };
  }

  moveCrop(e: MouseEvent): void {
    if (!this.isCropping || !this.cropStart) return;
    const x = Math.min(this.cropStart.x, e.offsetX);
    const y = Math.min(this.cropStart.y, e.offsetY);
    this.cropBox = { left: x + 'px', top: y + 'px', width: Math.abs(e.offsetX - this.cropStart.x) + 'px', height: Math.abs(e.offsetY - this.cropStart.y) + 'px' };
  }

  endCrop(e: MouseEvent): void {
    if (!this.isCropping || !this.cropStart || !this.activeSlot?.imageSrc) return;
    if (this.cropBox) this.applyManualCrop(this.activeSlot.imageSrc, this.activeSlot);
    this.isCropping = false; this.cropStart = null; this.cropBox = null;
  }

  private applyManualCrop(src: string, slot: CnicSlot): void {
    if (!this.cropBox) return;
    const img = new Image();
    img.onload = () => {
      const imgEl = document.querySelector('.preview-main-img') as HTMLImageElement;
      if (!imgEl) return;
      const scaleX = img.naturalWidth / imgEl.clientWidth;
      const scaleY = img.naturalHeight / imgEl.clientHeight;
      const cropX = parseInt(this.cropBox!['left']) * scaleX;
      const cropY = parseInt(this.cropBox!['top']) * scaleY;
      const cropW = parseInt(this.cropBox!['width']) * scaleX;
      const cropH = parseInt(this.cropBox!['height']) * scaleY;
      if (cropW < 10 || cropH < 10) return;
      const canvas = document.createElement('canvas');
      canvas.width = cropW; canvas.height = cropH;
      canvas.getContext('2d')!.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      slot.imageCropped = canvas.toDataURL('image/jpeg', 0.92);
    };
    img.src = src;
  }

  resetCrop(): void {
    if (this.activeSlot) this.activeSlot.imageCropped = null;
    this.cropBox = null;
  }

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

  refreshCopyOptions(): void {
    const hasImages = this.cnicDesigns.some(s => s.imageSrc !== null);
    this.copyOptions = [2, 4, 6, 8].map(v => ({ value: v, available: hasImages }));
    if (!this.copyOptions.find(c => c.value === this.selectedCopies)?.available) {
      this.selectedCopies = 4;
    }
  }

  selectCopies(val: number): void { this.selectedCopies = val; this.copiesDropdownOpen = false; }

  toggleCopiesDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.copiesDropdownOpen = !this.copiesDropdownOpen;
  }

  closeCopiesDropdown(): void { this.copiesDropdownOpen = false; }

  getLayoutSlots(): Array<{ imageSrc: string | null; label: string }> {
    const confirmed = this.confirmedDesigns;
    return Array.from({ length: this.selectedCopies }, (_, i) => {
      if (confirmed.length === 0) return { imageSrc: null, label: '' };
      const design = confirmed[i % confirmed.length];
      return { imageSrc: design.imageCropped || design.imageSrc, label: design.label };
    });
  }

  // ─── PDF Download ─────────────────────────────────────────────────────────
  /**
   * A4 in mm: 210 × 297  |  margin: 10mm  |  gap between cards: 5mm
   * CNIC ISO/IEC 7810 ID-1: 85.6 × 54 mm (ratio 1.585)
   *
   * Grid layout by selectedCopies:
   *   2  → 1 col × 2 rows
   *   4  → 2 col × 2 rows
   *   6  → 2 col × 3 rows
   *   8  → 2 col × 4 rows
   *
   * Pages:
   *   - If both front AND back designs exist → 2 pages (front page, back page)
   *   - Otherwise → 1 page with all confirmed designs cycling
   */
  async downloadPDF(): Promise<void> {
    if (!this.anyConfirmed) return;
    this.mobileMenuOpen = false;
    this.loaderMessage = 'Generating PDF…';
    this.isLoading = true;

    try {
      const cols = this.selectedCopies === 2 ? 1 : 2;
      const rows = Math.ceil(this.selectedCopies / cols);

      const pageW = 210, pageH = 297;
      const margin = 10, gap = 5;
      const printW = pageW - margin * 2;
      const printH = pageH - margin * 2;

      const cellW = (printW - gap * (cols - 1)) / cols;
      const cellH = (printH - gap * (rows - 1)) / rows;

      // Fit CNIC (ratio 1.585) inside cell, centred
      const cnicRatio = 85.6 / 54;
      let imgW = cellW;
      let imgH = imgW / cnicRatio;
      if (imgH > cellH) { imgH = cellH; imgW = imgH * cnicRatio; }
      const offsetX = (cellW - imgW) / 2;
      const offsetY = (cellH - imgH) / 2;

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const drawGrid = (designs: CnicSlot[], pageLabel: string) => {
        for (let i = 0; i < this.selectedCopies; i++) {
          const design = designs[i % designs.length];
          const src = design.imageCropped || design.imageSrc;
          if (!src) continue;

          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = margin + col * (cellW + gap) + offsetX;
          const y = margin + row * (cellH + gap) + offsetY;
          const fmt = src.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          pdf.addImage(src, fmt, x, y, imgW, imgH);
        }
        // Light footer label
        pdf.setFontSize(7);
        pdf.setTextColor(180, 180, 180);
        pdf.text(pageLabel, pageW / 2, pageH - 3, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
      };

      const frontDesigns = this.confirmedDesigns.filter((_, i) => i % 2 === 0);
      const backDesigns = this.confirmedDesigns.filter((_, i) => i % 2 === 1);
      const hasBoth = frontDesigns.length > 0 && backDesigns.length > 0;

      if (hasBoth) {
        drawGrid(frontDesigns, 'Front Side — PrintStudio');
        pdf.addPage();
        drawGrid(backDesigns, 'Back Side — PrintStudio');
      } else {
        drawGrid(this.confirmedDesigns, 'CNIC Layout — PrintStudio');
      }

      const date = new Date().toISOString().slice(0, 10);
      pdf.save(`CNIC_Layout_${date}.pdf`);

    } catch (err) {
      console.error('PDF generation failed:', err);
      alert('PDF generation failed. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }
}