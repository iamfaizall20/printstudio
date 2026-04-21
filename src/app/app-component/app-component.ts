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
  copies: number; // per-CNIC copy count
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

  // Fixed 8 slots per page
  readonly SLOTS_PER_PAGE = 8;

  // Available copy counts per CNIC
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

  // Legacy — kept for refreshCopyOptions compat, not used for tiling anymore
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
      { id: baseId, imageSrc: null, imageCropped: null, confirmed: false, label: `CNIC ${pairNum} — Front`, side: 'front', copies: 4 },
      { id: baseId + 1, imageSrc: null, imageCropped: null, confirmed: false, label: `CNIC ${pairNum} — Back`, side: 'back', copies: 4 }
    );
    this.refreshCopyOptions();
  }

  /** Remove an entire pair (front+back) by pair index */
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

  /**
   * Set copies for ALL slots in a pair (front + back share the same count).
   * When one side's copies changes, sync the paired opposite side too.
   */
  setPairCopies(pairIndex: number, copies: number): void {
    const startIndex = pairIndex * 2;
    if (this.cnicDesigns[startIndex]) this.cnicDesigns[startIndex].copies = copies;
    if (this.cnicDesigns[startIndex + 1]) this.cnicDesigns[startIndex + 1].copies = copies;
  }

  /** Get copies for a pair (reads from front slot of pair) */
  getPairCopies(pairIndex: number): number {
    return this.cnicDesigns[pairIndex * 2]?.copies ?? 4;
  }

  /**
   * Returns how many total slots are claimed by uploaded pairs.
   * Used to warn when total > 8.
   */
  get totalClaimedSlots(): number {
    return this.getCnicPairs()
      .filter(pair => pair.some(s => s.imageSrc))
      .reduce((sum, _, pi) => sum + this.getPairCopies(pi), 0);
  }

  get slotsOverLimit(): boolean {
    return this.totalClaimedSlots > this.SLOTS_PER_PAGE;
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
  }

  selectCopies(val: number): void {
    this.copiesDropdownOpen = false;
  }

  toggleCopiesDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.copiesDropdownOpen = !this.copiesDropdownOpen;
  }

  closeCopiesDropdown(): void { this.copiesDropdownOpen = false; }

  /**
   * Build tiled slots for a page from an ordered list of designs with their copy counts.
   * Each design occupies exactly `design.copies` consecutive slots.
   * If total copies < 8, remaining slots wrap back from the first design.
   * If total copies > 8, slots are capped at SLOTS_PER_PAGE.
   */
  private buildPageSlots(
    designs: CnicSlot[]
  ): Array<{ imageSrc: string | null; label: string; isEmpty: boolean; slotIndex: number }> {
    // Build the full ordered sequence: [CNIC1 × copies, CNIC2 × copies, ...]
    const sequence: CnicSlot[] = [];
    for (const design of designs) {
      for (let c = 0; c < design.copies; c++) {
        sequence.push(design);
      }
    }

    return Array.from({ length: this.SLOTS_PER_PAGE }, (_, i) => {

      // ✅ EMPTY SLOT CONDITION
      if (i >= sequence.length) {
        return {
          imageSrc: null,
          label: '',
          isEmpty: true,
          slotIndex: i,
        };
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

  /** Check if we have both front and back confirmed designs */
  get hasBothSides(): boolean {
    return this.confirmedFronts.length > 0 && this.confirmedBacks.length > 0;
  }

  get hasFrontOnly(): boolean {
    return this.confirmedFronts.length > 0 && this.confirmedBacks.length === 0;
  }

  get hasBackOnly(): boolean {
    return this.confirmedBacks.length > 0 && this.confirmedFronts.length === 0;
  }

  // ─── PDF Download ─────────────────────────────────────────────────────────
  async downloadPDF(): Promise<void> {
    if (!this.anyConfirmed) return;
    this.mobileMenuOpen = false;
    this.loaderMessage = 'Generating PDF…';
    this.isLoading = true;

    try {
      const cols = 2;
      const rows = 4;
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

      /**
       * Draw one A4 page using the same sequence logic as buildPageSlots().
       * Builds [CNIC1×copies, CNIC2×copies, ...] then wraps to fill 8 slots.
       */
      const drawPage = (designs: CnicSlot[], pageLabel: string) => {
        // Build sequence identical to buildPageSlots
        const sequence: CnicSlot[] = [];
        for (const design of designs) {
          for (let c = 0; c < design.copies; c++) {
            sequence.push(design);
          }
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
        // Footer
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

    // Reset all CNIC slots
    this.cnicDesigns = [
      {
        id: 1,
        imageSrc: null,
        imageCropped: null,
        confirmed: false,
        label: 'CNIC 1 — Front',
        side: 'front',
        copies: 4
      },
      {
        id: 2,
        imageSrc: null,
        imageCropped: null,
        confirmed: false,
        label: 'CNIC 1 — Back',
        side: 'back',
        copies: 4
      }
    ];

    // Reset UI states
    this.showPreviewDialog = false;
    this.showUploadDialog = false;
    this.activePreviewTab = 0;

    this.isCropping = false;
    this.cropBox = null;

    this.mobileMenuOpen = false;

    // Reset counters
    this.refreshCopyOptions();

    // Restore scroll
    document.body.style.overflow = '';
  }
}