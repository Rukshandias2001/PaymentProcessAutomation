import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentService, PaymentCertificate, Invoice } from '../../services/payment.service';
import { SimulationService } from '../../services/simulation.service';

@Component({
  selector: 'app-cert-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './cert-detail.component.html',
  styleUrl: './cert-detail.component.css'
})
export class CertDetailComponent implements OnInit {
  isCreateMode = false;
  loading = false;
  submitting = false;
  error = '';
  todayDate = new Date();
  
  invoice: Invoice | null = null;
  certificate: PaymentCertificate | null = null;
  
  // Create mode fields
  amount_certified: number = 0;
  remarks: string = '';
  
  // Approval remarks entered during review
  approval_remarks: string = '';

  constructor(
    private paymentService: PaymentService,
    public simService: SimulationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    const itdNo = this.route.snapshot.paramMap.get('itd_no');
    const id = this.route.snapshot.paramMap.get('id');

    if (itdNo) {
      this.isCreateMode = true;
      this.loadInvoice(itdNo);
    } else if (id) {
      this.isCreateMode = false;
      this.loadCertificate(id);
    }
  }

  loadInvoice(itdNo: string) {
    this.loading = true;
    this.paymentService.getInvoice(itdNo).subscribe({
      next: (data) => {
        this.invoice = data;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load referenced invoice details.';
        this.loading = false;
      }
    });
  }

  loadCertificate(certNo: string) {
    this.loading = true;
    this.paymentService.getCertificate(certNo).subscribe({
      next: (data) => {
        this.certificate = data;
        this.loading = false;
      },
      error: (err) => {
        console.error(err);
        this.error = 'Failed to load certificate details.';
        this.loading = false;
      }
    });
  }

  createCertificate() {
    if (!this.invoice) return;
    this.submitting = true;
    this.error = '';

    const payload = {
      itd_no: this.invoice.itd_no,
      amount_certified: this.amount_certified,
      remarks: this.remarks
    };

    this.paymentService.createCertificate(payload).subscribe({
      next: (newCert) => {
        this.submitting = false;
        this.router.navigate(['/certificates/view', newCert.certificate_no]);
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.detail || 'Failed to create payment certificate.';
        this.submitting = false;
      }
    });
  }

  canApprove(): boolean {
    if (!this.certificate) return false;
    const currentRole = this.simService.currentRole();
    const status = this.certificate.status;

    if (status === 'Pending PM Approval' && currentRole === 'PM') return true;
    if (status === 'Pending TL Approval' && currentRole === 'TL') return true;
    if (status === 'Pending FC Approval' && currentRole === 'FC') return true;
    if (status === 'Pending FD Approval' && currentRole === 'FD') return true;

    return false;
  }

  getCurrentRequiredRoleLabel(): string {
    if (!this.certificate) return '';
    const status = this.certificate.status;
    if (status === 'Pending PM Approval') return 'Project Manager (PM)';
    if (status === 'Pending TL Approval') return 'Technical Lead (TL)';
    if (status === 'Pending FC Approval') return 'Financial Controller (FC)';
    if (status === 'Pending FD Approval') return 'Finance Director (FD)';
    return '';
  }

  submitApproval(action: 'approve' | 'reject') {
    if (!this.certificate) return;
    this.submitting = true;
    this.error = '';

    const payload = {
      approver_role: this.simService.currentRole(),
      action: action,
      remarks: this.approval_remarks
    };

    this.paymentService.approveCertificate(this.certificate.certificate_no, payload).subscribe({
      next: (updatedCert) => {
        this.certificate = updatedCert;
        this.approval_remarks = '';
        this.submitting = false;
      },
      error: (err) => {
        console.error(err);
        this.error = err.error?.detail || 'Action failed.';
        this.submitting = false;
      }
    });
  }
}
