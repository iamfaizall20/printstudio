import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostBinding, OnInit, ViewChild } from '@angular/core';

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

  // Theme
  @HostBinding('class.light-theme') isLightTheme = false;

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

  // Mobile menu
  mobileMenuOpen = false;

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
    // Restore saved theme
    const saved = localStorage.getItem('printstudio-theme');
    if (saved === 'light') this.isLightTheme = true;

    document.addEventListener('click', (e) => {
      if (this.copiesDropdownOpen) {
        this.copiesDropdownOpen = false;
      }
    });
  }

  // ─── Theme ────────────────────────────────────────────────────────────────
  toggleTheme(): void {
    this.isLightTheme = !this.isLightTheme;
    localStorage.setItem('printstudio-theme', this.isLightTheme ? 'light' : 'dark');
    this.mobileMenuOpen = false;
  }

  // ─── Mobile Menu ─────────────────────────────────────────────────────────
  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  // ─── Upload Dialog ────────────────────────────────────────────────────────
  openUploadDialog(): void {
    this.mobileMenuOpen = false;
    this.showUploadDialog = true;
    document.body.style.overflow = 'hidden';
  }

  closeUploadDialog(): void {
    this.showUploadDialog = false;
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
    const src =
      this.activePreviewTab === 'front' ? this.frontImageSrc : this.backImageSrc;
    if (src) {
      this.applyCropSimulated(src, this.activePreviewTab, () => {
        this.cropLoading = false;
      });
    } else {
      this.cropLoading = false;
    }
  }

  private applyCropSimulated(src: string, side: 'front' | 'back', done?: () => void): void {
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
      if (done) done();
    };
    img.onerror = () => {
      if (done) done();
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
    // Apply the manual crop from cropBox
    const src =
      this.activePreviewTab === 'front' ? this.frontImageSrc : this.backImageSrc;
    if (src && this.cropBox) {
      this.applyManualCrop(src, this.activePreviewTab);
    }
    this.isCropping = false;
    this.cropStart = null;
    this.cropBox = null;
  }

  private applyManualCrop(src: string, side: 'front' | 'back'): void {
    if (!this.cropBox) return;
    const img = new Image();
    img.onload = () => {
      // Get the rendered image element to compute scale
      const imgEl = document.querySelector('.preview-main-img') as HTMLImageElement;
      if (!imgEl) return;
      const scaleX = img.naturalWidth / imgEl.clientWidth;
      const scaleY = img.naturalHeight / imgEl.clientHeight;
      const cropX = parseInt(this.cropBox!['left']) * scaleX;
      const cropY = parseInt(this.cropBox!['top']) * scaleY;
      const cropW = parseInt(this.cropBox!['width']) * scaleX;
      const cropH = parseInt(this.cropBox!['height']) * scaleY;
      if (cropW < 10 || cropH < 10) return; // too small, skip
      const canvas = document.createElement('canvas');
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

  resetCrop(): void {
    if (this.activePreviewTab === 'front') this.frontImageCropped = null;
    else this.backImageCropped = null;
    this.cropBox = null;
  }

  // FIX: confirmPreview no longer triggers the stuck loading state.
  // It directly confirms images without closing dialog first to avoid timing bug.
  confirmPreview(): void {
    // Immediately mark images as confirmed from what we have
    if (this.frontImageSrc) this.frontImageConfirmed = true;
    if (this.backImageSrc) this.backImageConfirmed = true;

    // Close dialog and restore scroll
    this.showPreviewDialog = false;
    this.isCropping = false;
    this.cropBox = null;
    document.body.style.overflow = '';

    // Brief visual feedback loader
    this.loaderMessage = 'Building your layout...';
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
    }, 700);
  }

  // ─── Copies ──────────────────────────────────────────────────────────────
  updateCopyAvailability(): void {
    const hasImages = !!(this.frontImageSrc || this.backImageSrc);
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
    this.mobileMenuOpen = false;
    this.loaderMessage = 'Generating PDF...';
    this.isLoading = true;
    setTimeout(() => {
      this.isLoading = false;
      alert('PDF generation requires a PDF library (e.g., jsPDF). Integrate jsPDF to export your A4 layout.');
    }, 1800);
  }
}