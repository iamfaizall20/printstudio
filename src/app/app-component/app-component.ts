import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';

interface CopyOption {
  value: number;
  available: boolean;
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
  @ViewChild('frontImg') frontImgEl!: ElementRef<HTMLImageElement>;

  // Image state
  frontImageSrc: string | null = null;
  backImageSrc: string | null = null;
  frontImageCropped: string | null = null;
  backImageCropped: string | null = null;
  frontImageConfirmed = false;
  backImageConfirmed = false;

  // Dialog state
  showUploadDialog = false;
  showPreviewDialog = false;
  activePreviewTab: 'front' | 'back' = 'front';

  // Copies
  selectedCopies = 4;
  copyOptions: CopyOption[] = [
    { value: 2, available: true },
    { value: 4, available: true },
    { value: 6, available: true },
    { value: 8, available: true },
  ];
  copiesDropdownOpen = false;

  // Crop state
  isCropping = false;
  cropLoading = false;
  cropBox: { [key: string]: string } | null = null;
  private cropStart: { x: number; y: number } | null = null;

  // Loader
  isLoading = false;
  loaderMessage = 'Processing...';

  ngOnInit(): void {
    document.addEventListener('click', () => {
      if (this.copiesDropdownOpen) {
        this.copiesDropdownOpen = false;
      }
    });
  }

  // ─── Upload Dialog ────────────────────────────────────────────────────────
  openUploadDialog(): void {
    this.showUploadDialog = true;
    document.body.style.overflow = 'hidden';
  }

  closeUploadDialog(): void {
    this.showUploadDialog = false;
    // document.body.style.overflow = '';
  }

  triggerFrontUpload(): void {
    this.frontInput?.nativeElement.click();
  }

  triggerBackUpload(): void {
    this.backInput?.nativeElement.click();
  }

  onFileSelect(event: Event, side: 'front' | 'back'): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    this.readFile(file, side);
  }

  onDrop(event: DragEvent, side: 'front' | 'back'): void {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.readFile(file, side);
  }

  private readFile(file: File, side: 'front' | 'back'): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (side === 'front') {
        this.frontImageSrc = result;
        this.frontImageCropped = null;
        this.frontImageConfirmed = false;
      } else {
        this.backImageSrc = result;
        this.backImageCropped = null;
        this.backImageConfirmed = false;
      }
      this.updateCopyAvailability();
    };
    reader.readAsDataURL(file);
  }

  confirmUpload(): void {
    if (!this.frontImageSrc && !this.backImageSrc) return;
    this.closeUploadDialog();
    setTimeout(() => {
      this.showPreviewDialog = true;
      this.activePreviewTab = this.frontImageSrc ? 'front' : 'back';
      document.body.style.overflow = 'hidden';
    }, 150);
  }

  // ─── Preview Dialog ───────────────────────────────────────────────────────
  closePreviewDialog(): void {
    this.showPreviewDialog = false;
    this.isCropping = false;
    this.cropBox = null;
    document.body.style.overflow = '';
  }

  switchTab(tab: 'front' | 'back'): void {
    this.activePreviewTab = tab;
    this.isCropping = false;
    this.cropBox = null;
  }

  activeTabHasCrop(): boolean {
    return this.activePreviewTab === 'front'
      ? !!this.frontImageCropped
      : !!this.backImageCropped;
  }

  autoCrop(): void {
    this.cropLoading = true;
    setTimeout(() => {
      // Simulate auto-crop by applying a simulated center crop
      const src =
        this.activePreviewTab === 'front' ? this.frontImageSrc : this.backImageSrc;
      if (src) {
        this.applyCropSimulated(src, this.activePreviewTab);
      }
      this.cropLoading = false;
    }, 1200);
  }

  private applyCropSimulated(src: string, side: 'front' | 'back'): void {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const cropW = img.width * 0.9;
      const cropH = img.height * 0.85;
      const cropX = img.width * 0.05;
      const cropY = img.height * 0.075;
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const cropped = canvas.toDataURL('image/jpeg', 0.92);
      if (side === 'front') this.frontImageCropped = cropped;
      else this.backImageCropped = cropped;
    };
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
    const w = Math.abs(e.offsetX - this.cropStart.x);
    const h = Math.abs(e.offsetY - this.cropStart.y);
    this.cropBox = {
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px',
    };
  }

  endCrop(e: MouseEvent): void {
    if (!this.isCropping || !this.cropStart) return;
    this.isCropping = false;
    this.cropStart = null;
  }

  resetCrop(): void {
    if (this.activePreviewTab === 'front') this.frontImageCropped = null;
    else this.backImageCropped = null;
    this.cropBox = null;
  }

  confirmPreview(): void {
    this.loaderMessage = 'Building your layout...';
    this.isLoading = true;
    this.closePreviewDialog();
    setTimeout(() => {
      if (this.frontImageSrc) this.frontImageConfirmed = true;
      if (this.backImageSrc) this.backImageConfirmed = true;
      this.isLoading = false;
    }, 1400);
  }

  // ─── Copies ──────────────────────────────────────────────────────────────
  updateCopyAvailability(): void {
    const hasImages = !!(this.frontImageSrc || this.backImageSrc);
    this.copyOptions = this.copyOptions.map((c) => ({
      ...c,
      available: hasImages ? c.value <= 8 : false,
    }));
    // Re-enable all valid options (2,4,6,8 are all valid for A4 CNIC)
    this.copyOptions = [
      { value: 2, available: hasImages },
      { value: 4, available: hasImages },
      { value: 6, available: hasImages },
      { value: 8, available: hasImages },
    ];
    if (!this.copyOptions.find((c) => c.value === this.selectedCopies)?.available) {
      this.selectedCopies = 4;
    }
  }

  selectCopies(val: number): void {
    this.selectedCopies = val;
    this.copiesDropdownOpen = false;
  }

  toggleCopiesDropdown(): void {
    this.copiesDropdownOpen = !this.copiesDropdownOpen;
  }

  getCopiesArray(): number[] {
    return Array.from({ length: this.selectedCopies }, (_, i) => i);
  }

  // ─── Download PDF ─────────────────────────────────────────────────────────
  downloadPDF(): void {
    if (!this.frontImageConfirmed && !this.backImageConfirmed) return;
    this.loaderMessage = 'Generating PDF...';
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      alert('PDF generation requires a PDF library (e.g., jsPDF). Integrate jsPDF to export your A4 layout.');
    }, 1800);
  }
}
