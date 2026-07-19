import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentService, Invoice, CostCenter, Account } from '../../services/payment.service';
import * as XLSX from 'xlsx-js-style';

@Component({
  selector: 'app-invoice-form',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './invoice-form.component.html',
  styleUrl: './invoice-form.component.css'
})
export class InvoiceFormComponent implements OnInit {
  isEditMode = false;
  loading = false;
  submitting = false;
  exportingPoExcel = false;
  error = '';
  originalStatus = '';
  poSummary: any = null;
  poOverLimitError = '';
  selectedFiles: File[] = [];
  documents: string[] = [];
  uploadingFiles = false;
  showSuccessModal = false;
  createdItdNo = '';
  showToast = false;
  toastItd = '';
  toastOldStatus = '';
  toastNewStatus = '';
  toastTimeout: any = null;
  costCenters: CostCenter[] = [];
  accounts: Account[] = [];
  
  invoice: Invoice = {
    itd_no: '',
    vendor_names: '',
    invoice_took_date: '',
    invoice_sent: '',
    cost_center: '',
    grn_number: '',
    description: '',
    po_number: '',
    status: 'Pending',
    payment_type: '',
    price: 0,
    total_goods: 0,
    purchased_goods: 0,
    total_po_quantity: 0,
    delivered_quantity: 0,
    vender_details: ''
  };

  constructor(
    private paymentService: PaymentService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadCostCenters();
    this.loadAccounts();
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.isEditMode = true;
        this.loadInvoice(id);
      } else {
        this.isEditMode = false;
        // Pre-fill default dates with current local date
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        
        this.invoice.invoice_took_date = dateStr;
        this.invoice.invoice_sent = dateStr;

        // Auto-fetch next ITD number from backend
        this.paymentService.getNextItdNo().subscribe({
          next: (res) => {
            this.invoice.itd_no = res.next_itd_no;
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('Failed to fetch next ITD number:', err);
          }
        });
      }
    });
  }

  loadInvoice(id: string) {
    this.loading = true;
    this.error = '';
    this.paymentService.getInvoice(id).subscribe({
      next: (data) => {
        this.originalStatus = data.status || 'Pending';
        this.invoice = {
          itd_no: data.itd_no || '',
          vendor_names: data.vendor_names || '',
          invoice_took_date: data.invoice_took_date || '',
          invoice_sent: data.invoice_sent || '',
          cost_center: data.cost_center || '',
          grn_number: data.grn_number || '',
          description: data.description || '',
          po_number: data.po_number || '',
          status: data.status || 'Pending',
          payment_type: data.payment_type || '',
          price: data.price || 0,
          total_goods: data.total_goods || data.total_po_quantity || 0,
          purchased_goods: data.purchased_goods || data.delivered_quantity || 0,
          total_po_quantity: data.total_goods || data.total_po_quantity || 0,
          delivered_quantity: data.purchased_goods || data.delivered_quantity || 0,
          vender_details: data.vender_details || '',
          cost_center_id: data.cost_center_id,
          cost_center_name: data.cost_center_name,
          cost_center_type: data.cost_center_type,
          account_id: data.account_id,
          account_number: data.account_number,
          account_type: data.account_type,
        };
        this.retrofitLegacyFields();
        this.loading = false;
        this.loadDocuments(data.itd_no || '');
        this.cdr.detectChanges();

        if (this.invoice.po_number) {
          this.onPoNumberOrQtyChange();
        }
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load invoice details.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  onPoNumberOrQtyChange() {
    this.poOverLimitError = '';
    const poNum = this.invoice.po_number?.trim();
    if (!poNum) {
      this.poSummary = null;
      return;
    }

    // Keep compatibility
    this.invoice.total_po_quantity = this.invoice.total_goods;
    this.invoice.delivered_quantity = this.invoice.purchased_goods;

    this.paymentService.getPoSummary(poNum).subscribe({
      next: (summary) => {
        this.poSummary = summary;

        // If in Create Mode and PO has total_goods set from prior invoices, pre-fill total_goods
        const existingTotal = summary.total_goods || summary.total_po_quantity;
        if (!this.isEditMode && existingTotal && !this.invoice.total_goods) {
          this.invoice.total_goods = existingTotal;
          this.invoice.total_po_quantity = existingTotal;
        }

        // Validate Partial Delivery limits if payment_type is Partial Equipment / PO Delivery
        if (this.invoice.payment_type === 'Partial Equipment / PO Delivery') {
          const currentPurchased = Number(this.invoice.purchased_goods || this.invoice.delivered_quantity || 0);
          const totalLimit = Number(this.invoice.total_goods || existingTotal || 0);
          
          // Exclude current invoice from previous delivered sum if in edit mode
          let previouslyPurchased = summary.total_purchased_goods || summary.total_delivered_quantity || 0;
          if (this.isEditMode && summary.invoices) {
            const currentItem = summary.invoices.find((i: any) => i.itd_no === this.invoice.itd_no);
            if (currentItem) {
              previouslyPurchased -= (currentItem.purchased_goods || currentItem.delivered_quantity || 0);
            }
          }

          if (totalLimit > 0) {
            if (previouslyPurchased >= totalLimit) {
              this.poOverLimitError = `❌ Cannot proceed: total_goods limit of ${totalLimit} items for PO '${poNum}' has already been fully purchased (${previouslyPurchased} items purchased previously across prior invoices).`;
            } else if ((previouslyPurchased + currentPurchased) > totalLimit) {
              this.poOverLimitError = `❌ Cannot proceed: purchased_goods of ${currentPurchased} items exceeds PO '${poNum}' total_goods limit of ${totalLimit} items (${previouslyPurchased} purchased previously + ${currentPurchased} requested = ${previouslyPurchased + currentPurchased} > ${totalLimit}).`;
            }
          }
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load PO summary:', err);
      }
    });
  }

  // Export Partial Delivery Breakdown History to Excel with requested exact columns: ITD Number, Vendor Name, purchased_goods, total_goods, Invoice Price ($) - STATUS EXCLUDED
  exportPartialDeliveryExcel() {
    if (!this.poSummary || !this.poSummary.invoices || this.poSummary.invoices.length === 0) {
      alert('No partial delivery records available to export for this PO Number.');
      return;
    }

    this.exportingPoExcel = true;
    this.cdr.detectChanges();

    // Requested exact columns: ITD Number, Vendor Name, purchased_goods, total_goods, Invoice Price ($) - STATUS EXCLUDED
    const excelData = this.poSummary.invoices.map((inv: any) => ({
      'ITD Number': inv.itd_no || '',
      'Vendor Name': inv.vendor_names || '',
      'purchased_goods': inv.purchased_goods || inv.delivered_quantity || 0,
      'total_goods': inv.total_goods || inv.total_po_quantity || this.poSummary.total_goods || 0,
      'Invoice Price ($)': inv.price ? Number(inv.price).toFixed(2) : '0.00'
    }));

    // Build worksheet
    const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);

    // Column widths
    worksheet['!cols'] = [
      { wch: 18 }, // ITD Number
      { wch: 28 }, // Vendor Name
      { wch: 20 }, // purchased_goods
      { wch: 20 }, // total_goods
      { wch: 22 }  // Invoice Price ($)
    ];

    // Header Style: Deep Navy background, Bold White text, centered
    const headerStyle = {
      fill: { fgColor: { rgb: "1E1B4B" } }, // Dark Indigo / Navy Fill
      font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: "374151" } },
        bottom: { style: "medium", color: { rgb: "6366F1" } },
        left: { style: "thin", color: { rgb: "374151" } },
        right: { style: "thin", color: { rgb: "374151" } }
      }
    };

    const defaultBorder = {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } }
    };

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellAddress];
        if (!cell) continue;

        if (R === 0) {
          cell.s = headerStyle;
        } else {
          const isEvenRow = R % 2 === 0;
          const bgRgb = isEvenRow ? "F9FAFB" : "FFFFFF";
          const isCentered = C === 0 || C === 2 || C === 3;
          cell.s = {
            fill: { fgColor: { rgb: bgRgb } },
            font: { name: "Calibri", sz: 10, color: { rgb: "111827" } },
            alignment: { horizontal: C === 4 ? "right" : (isCentered ? "center" : "left"), vertical: "center" },
            border: defaultBorder
          };
        }
      }
    }

    const cleanPo = (this.poSummary.po_number || 'PO').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sheetName = `Partial_Delivery_${cleanPo}`.substring(0, 30);
    const workbook: XLSX.WorkBook = {
      Sheets: { [sheetName]: worksheet },
      SheetNames: [sheetName]
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const fileName = `Partial_Delivery_Breakdown_${cleanPo}_${todayStr}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    this.exportingPoExcel = false;
    this.cdr.detectChanges();
  }

  onSubmit() {
    if (this.poOverLimitError) {
      alert(this.poOverLimitError);
      return;
    }

    this.submitting = true;
    this.error = '';

    // Ensure synced
    this.invoice.total_po_quantity = this.invoice.total_goods;
    this.invoice.delivered_quantity = this.invoice.purchased_goods;

    if (this.isEditMode) {
      // Update status
      const previousStatus = this.originalStatus || 'Pending';
      const newStatus = this.invoice.status || 'Pending';

      this.paymentService.updateInvoice(this.invoice.itd_no, { status: newStatus }).subscribe({
        next: () => {
          this.submitting = false;
          this.triggerToast(this.invoice.itd_no, previousStatus, newStatus);
          
          setTimeout(() => {
            this.router.navigate(['/invoices']);
          }, 2500);
        },
        error: (err) => {
          console.error(err);
          this.error = err.error?.detail || 'Failed to update invoice status.';
          this.submitting = false;
          this.cdr.detectChanges();
        }
      });
    } else {
      // Create
      this.paymentService.createInvoice(this.invoice, this.selectedFiles).subscribe({
        next: (createdInvoice) => {
          this.submitting = false;
          this.createdItdNo = createdInvoice.itd_no;
          this.showSuccessModal = true;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error(err);
          this.error = err.error?.detail || 'Failed to create invoice.';
          this.submitting = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  dismissSuccessModal() {
    this.showSuccessModal = false;
    this.router.navigate(['/invoices']);
  }

  onFileSelected(event: any) {
    const filesList: FileList = event.target.files;
    if (filesList && filesList.length > 0) {
      for (let i = 0; i < filesList.length; i++) {
        // Prevent duplicate file references by name
        if (!this.selectedFiles.some(f => f.name === filesList[i].name)) {
          this.selectedFiles.push(filesList[i]);
        }
      }
    }
    // Reset file input so same file can be chosen again
    event.target.value = '';
    this.cdr.detectChanges();
  }

  removeSelectedFile(index: number) {
    this.selectedFiles.splice(index, 1);
    this.cdr.detectChanges();
  }

  loadDocuments(itdNo: string) {
    if (!itdNo) return;
    this.paymentService.getInvoiceDocuments(itdNo).subscribe({
      next: (docs) => {
        this.documents = docs;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load documents:', err);
      }
    });
  }

  uploadFilesDirectly(event: any) {
    const filesList: FileList = event.target.files;
    if (!filesList || filesList.length === 0) return;
    
    const filesArray: File[] = [];
    for (let i = 0; i < filesList.length; i++) {
      filesArray.push(filesList[i]);
    }
    
    this.uploadingFiles = true;
    this.error = '';
    this.cdr.detectChanges();
    
    this.paymentService.uploadInvoiceDocuments(this.invoice.itd_no, filesArray).subscribe({
      next: () => {
        this.uploadingFiles = false;
        // Reset file input
        event.target.value = '';
        this.loadDocuments(this.invoice.itd_no);
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.detail || 'Failed to upload documents.';
        this.uploadingFiles = false;
        this.cdr.detectChanges();
      }
    });
  }

  deleteDocument(filename: string) {
    if (!confirm(`Are you sure you want to delete '${filename}'?`)) return;
    
    this.paymentService.deleteInvoiceDocument(this.invoice.itd_no, filename).subscribe({
      next: () => {
        this.loadDocuments(this.invoice.itd_no);
      },
      error: (err) => {
        console.error(err);
        alert(err.error?.detail || 'Failed to delete document.');
      }
    });
  }

  getDocumentDownloadUrl(filename: string): string {
    return this.paymentService.getDocumentUrl(this.invoice.itd_no, filename);
  }

  triggerToast(itd: string, oldStatus: string, newStatus: string) {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastItd = itd;
    this.toastOldStatus = oldStatus;
    this.toastNewStatus = newStatus;
    this.showToast = true;
    this.cdr.detectChanges();

    this.toastTimeout = setTimeout(() => {
      this.closeToast();
    }, 4500);
  }

  closeToast() {
    this.showToast = false;
    this.cdr.detectChanges();
  }

  loadCostCenters() {
    this.paymentService.getCostCenters().subscribe({
      next: (res) => {
        this.costCenters = res;
        this.retrofitLegacyFields();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load cost centers:', err);
      }
    });
  }

  loadAccounts() {
    this.paymentService.getAccounts().subscribe({
      next: (res) => {
        this.accounts = res;
        this.retrofitLegacyFields();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load accounts:', err);
      }
    });
  }

  retrofitLegacyFields() {
    if (this.invoice.cost_center && !this.invoice.cost_center_id && this.costCenters.length > 0) {
      const code = this.invoice.cost_center.replace('CC-', '');
      const foundCc = this.costCenters.find(c => c.cost_center_code === code);
      if (foundCc) {
        this.invoice.cost_center_id = foundCc.cost_center_id;
        this.invoice.cost_center_name = foundCc.cost_center_name;
        this.invoice.cost_center_type = foundCc.cost_center_type;
      }
    }
    
    if (this.invoice.account_type && !this.invoice.account_id && this.accounts.length > 0) {
      const foundAcc = this.accounts.find(a => a.account_type === this.invoice.account_type || a.account_name === this.invoice.account_type);
      if (foundAcc) {
        this.invoice.account_id = foundAcc.account_id;
        this.invoice.account_number = foundAcc.account_number;
        this.invoice.account_type = foundAcc.account_type;
      }
    }
    this.cdr.detectChanges();
  }

  onCostCenterSelected() {
    const selected = this.costCenters.find(c => Number(c.cost_center_id) === Number(this.invoice.cost_center_id));
    if (selected) {
      this.invoice.cost_center_id = selected.cost_center_id;
      this.invoice.cost_center_name = selected.cost_center_name;
      this.invoice.cost_center_type = selected.cost_center_type;
      this.invoice.cost_center = 'CC-' + selected.cost_center_code; // Sync with original code format
    } else {
      this.invoice.cost_center_id = undefined;
      this.invoice.cost_center_name = '';
      this.invoice.cost_center_type = '';
      this.invoice.cost_center = '';
    }
    this.cdr.detectChanges();
  }

  onAccountSelected() {
    const selected = this.accounts.find(a => Number(a.account_id) === Number(this.invoice.account_id));
    if (selected) {
      this.invoice.account_id = selected.account_id;
      this.invoice.account_number = selected.account_number;
      this.invoice.account_type = selected.account_type;
    } else {
      this.invoice.account_id = undefined;
      this.invoice.account_number = '';
      this.invoice.account_type = '';
    }
    this.cdr.detectChanges();
  }

  isPurchasePaymentType(): boolean {
    const purchases = [
      'Software Purchases',
      'Partial Equipment / PO Delivery',
      'Computer Equipment Purchases',
      'Computer Software Purchases',
      'Hardware Purchases'
    ];
    return purchases.includes(this.invoice.payment_type || '');
  }

  isNonPurchasePaymentType(): boolean {
    const nonPurchases = [
      'Software Subscriptions (Monthly)',
      'Software Subscriptions (Annual)',
      'Service & Maintenance',
      'Foreign Payments'
    ];
    return nonPurchases.includes(this.invoice.payment_type || '');
  }
}
