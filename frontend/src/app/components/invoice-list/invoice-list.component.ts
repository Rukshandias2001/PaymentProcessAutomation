import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentService, Invoice } from '../../services/payment.service';
import XLSX from 'xlsx-js-style';

@Component({
  selector: 'app-invoice-list',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './invoice-list.component.html',
  styleUrl: './invoice-list.component.css'
})
export class InvoiceListComponent implements OnInit {
  invoices: Invoice[] = [];
  vendors: string[] = [];
  loading = true;
  exportingExcel = false;
  error = '';
  currentUser: any = null;
  invoicesAwaitingApproval: Invoice[] = [];
  activeTab: 'queue' | 'all' = 'queue';
  
  // Toast state variables
  showToast = false;
  toastItd = '';
  toastOldStatus = '';
  toastNewStatus = '';
  toastTimeout: any = null;

  // Pagination controls (5 items per page default)
  page = 1;
  size = 5;
  total = 0;
  totalPages = 1;
  
  // Header-based filters matching table fields
  filters = {
    itd_no: '',
    vendor_names: '',
    invoice_took_date: '',
    invoice_sent: '',
    cost_center: '',
    grn_number: '',
    po_number: '',
    status: '',
    payment_type: '',
    global_search: ''
  };

  constructor(
    private paymentService: PaymentService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.paymentService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.loadAwaitingApproval();
      this.cdr.detectChanges();
    });
    this.loadVendors();
    this.loadInvoices();
  }

  loadVendors() {
    this.paymentService.getVendors().subscribe({
      next: (data) => {
        this.vendors = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load vendors list:', err);
      }
    });
  }

  loadInvoices() {
    this.loading = true;
    this.error = '';
    this.paymentService.getInvoices(this.filters, this.page, this.size).subscribe({
      next: (res) => {
        this.invoices = res.items;
        this.total = res.total;
        this.page = res.page;
        this.size = res.size;
        this.totalPages = res.total_pages;
        this.loading = false;
        this.cdr.detectChanges(); // Ensure table rows render immediately on load
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to fetch invoices from the database.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadAwaitingApproval() {
    if (!this.currentUser) {
      this.invoicesAwaitingApproval = [];
      return;
    }
    this.paymentService.getInvoices({ current_approver: this.currentUser.role }, 1, 100).subscribe({
      next: (res) => {
        this.invoicesAwaitingApproval = res.items;
        if (this.currentUser.role !== 'Manager') {
          this.activeTab = 'queue';
        } else {
          if (this.invoicesAwaitingApproval.length === 0) {
            this.activeTab = 'all';
          } else {
            this.activeTab = 'queue';
          }
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load invoices awaiting approval:', err);
      }
    });
  }

  onFilter() {
    this.page = 1; // Reset to first page when filters change
    this.loadInvoices();
  }

  clearFilters() {
    this.filters = {
      itd_no: '',
      vendor_names: '',
      invoice_took_date: '',
      invoice_sent: '',
      cost_center: '',
      grn_number: '',
      po_number: '',
      status: '',
      payment_type: '',
      global_search: ''
    };
    this.page = 1;
    this.loadInvoices();
  }

  // Pagination navigation
  goToPage(p: number) {
    if (p >= 1 && p <= this.totalPages) {
      this.page = p;
      this.loadInvoices();
    }
  }

  nextPage() {
    if (this.page < this.totalPages) {
      this.page++;
      this.loadInvoices();
    }
  }

  prevPage() {
    if (this.page > 1) {
      this.page--;
      this.loadInvoices();
    }
  }

  onPageSizeChange() {
    this.page = 1;
    this.loadInvoices();
  }

  getPageArray(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.page - 2);
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  updateStatus(invoice: Invoice, newStatus: string) {
    if (invoice.status === newStatus) return;
    
    const previousStatus = invoice.status;
    this.paymentService.updateInvoice(invoice.itd_no, { status: newStatus }).subscribe({
      next: () => {
        invoice.status = newStatus;
        this.triggerToast(invoice.itd_no, previousStatus, newStatus);
        this.loadInvoices(); // Instantly reload fresh records
      },
      error: (err) => {
        console.error(err);
        alert(`Failed to update status for ITD Number ${invoice.itd_no}.`);
      }
    });
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

  // Generate and Download Styled Excel Sheet of exact filtered data
  exportToExcel() {
    this.exportingExcel = true;
    this.cdr.detectChanges();

    // Query backend for all records matching active filters (up to 10000 records)
    this.paymentService.getInvoices(this.filters, 1, 10000).subscribe({
      next: (res) => {
        const rawData = res.items;
        if (!rawData || rawData.length === 0) {
          alert('No invoice records found matching your active filters to export.');
          this.exportingExcel = false;
          this.cdr.detectChanges();
          return;
        }

        // Format nicely with matching column headers
        const excelData = rawData.map(inv => ({
          'ITD Number': inv.itd_no,
          'Vendor Name': inv.vendor_names || '',
          'Payment Type': inv.payment_type || '',
          'Invoice Took Date': inv.invoice_took_date || '',
          'Invoice Sent Date': inv.invoice_sent || '',
          'Cost Center': inv.cost_center || '',
          'GRN Number': inv.grn_number || '',
          'Billing Description': inv.description || '',
          'PO Number': inv.po_number || '',
          'Status': inv.status === 'Paid' ? 'Completed' : (inv.status || ''),
          'Vendor Contact Details': inv.vender_details || ''
        }));

        // Build worksheet
        const worksheet: XLSX.WorkSheet = XLSX.utils.json_to_sheet(excelData);

        // Column widths
        worksheet['!cols'] = [
          { wch: 16 }, // ITD Number
          { wch: 24 }, // Vendor Name
          { wch: 28 }, // Payment Type
          { wch: 18 }, // Invoice Took Date
          { wch: 18 }, // Invoice Sent Date
          { wch: 16 }, // Cost Center
          { wch: 18 }, // GRN Number
          { wch: 40 }, // Billing Description
          { wch: 16 }, // PO Number
          { wch: 16 }, // Status
          { wch: 34 }  // Vendor Details
        ];

        // Header Style: Deep Navy background, Bold White text, centered, gridlines
        const headerStyle = {
          fill: { fgColor: { rgb: "1E1B4B" } }, // Dark Indigo / Navy Fill
          font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
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

        // Range of cells in worksheet
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = worksheet[cellAddress];
            if (!cell) continue;

            // Row 0 is the Header Row
            if (R === 0) {
              cell.s = headerStyle;
            } else {
              const isEvenRow = R % 2 === 0;
              const bgRgb = isEvenRow ? "F9FAFB" : "FFFFFF";

              // Column C === 8 is the Status column
              if (C === 8) {
                const statusVal = cell.v ? String(cell.v).toUpperCase() : '';
                let statusFill = "F3F4F6";
                let statusFontColor = "374151";

                if (statusVal.includes('PENDING')) {
                  statusFill = "FEF3C7"; // Soft Amber fill
                  statusFontColor = "D97706"; // Bold Amber text
                } else if (statusVal.includes('APPROVED')) {
                  statusFill = "F3E8FF"; // Soft Purple fill
                  statusFontColor = "7E22CE"; // Bold Purple text
                } else if (statusVal.includes('COMPLETED') || statusVal.includes('PAID')) {
                  statusFill = "D1FAE5"; // Soft Emerald Green fill
                  statusFontColor = "047857"; // Bold Emerald text
                } else if (statusVal.includes('CANCELLED')) {
                  statusFill = "FEE2E2"; // Soft Red fill
                  statusFontColor = "B91C1C"; // Bold Red text
                }

                cell.s = {
                  fill: { fgColor: { rgb: statusFill } },
                  font: { name: "Calibri", sz: 10, bold: true, color: { rgb: statusFontColor } },
                  alignment: { horizontal: "center", vertical: "center" },
                  border: defaultBorder
                };
              } else {
                // Regular Data Cell
                const isCentered = C === 0 || C === 2 || C === 3 || C === 4 || C === 5 || C === 7;
                cell.s = {
                  fill: { fgColor: { rgb: bgRgb } },
                  font: { name: "Calibri", sz: 10, color: { rgb: "111827" } },
                  alignment: { horizontal: isCentered ? "center" : "left", vertical: "center" },
                  border: defaultBorder
                };
              }
            }
          }
        }

        // Create workbook & export file
        const workbook: XLSX.WorkBook = {
          Sheets: { 'Invoice Records': worksheet },
          SheetNames: ['Invoice Records']
        };

        const todayStr = new Date().toISOString().split('T')[0];
        const fileName = `Invoice_Records_${todayStr}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        this.exportingExcel = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to export Excel:', err);
        alert('Failed to generate Excel sheet from filtered data.');
        this.exportingExcel = false;
        this.cdr.detectChanges();
      }
    });
  }

  approveInvoiceDirectly(invoice: Invoice) {
    const oldStatus = invoice.status;
    this.paymentService.approveInvoice(invoice.itd_no).subscribe({
      next: (updated) => {
        this.triggerToast(invoice.itd_no, oldStatus, updated.status);
        this.loadAwaitingApproval();
        this.loadInvoices();
      },
      error: (err) => {
        console.error(err);
        alert(err.error?.detail || 'Failed to approve invoice.');
      }
    });
  }

  rejectInvoiceDirectly(invoice: Invoice) {
    const oldStatus = invoice.status;
    this.paymentService.rejectInvoice(invoice.itd_no).subscribe({
      next: (updated) => {
        this.triggerToast(invoice.itd_no, oldStatus, updated.status);
        this.loadAwaitingApproval();
        this.loadInvoices();
      },
      error: (err) => {
        console.error(err);
        alert(err.error?.detail || 'Failed to reject invoice.');
      }
    });
  }

  getDocumentDownloadUrl(invoice: Invoice, filename: string): string {
    return this.paymentService.getDocumentUrl(invoice.itd_no, filename);
  }
}
