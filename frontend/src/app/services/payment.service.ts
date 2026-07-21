import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface Invoice {
  itd_no: string;
  vendor_names?: string;
  invoice_took_date?: string;
  invoice_sent?: string;
  cost_center?: string;
  grn_number?: string;
  description?: string;
  po_number?: string;
  status: string;
  payment_type?: string;
  price?: number;
  total_goods?: number;
  purchased_goods?: number;
  total_po_quantity?: number;
  delivered_quantity?: number;
  vender_details?: string;
  cost_center_id?: number;
  cost_center_name?: string;
  cost_center_type?: string;
  account_id?: number;
  account_number?: string;
  account_type?: string;
  invoice_number?: string;
  created_at?: string;
  sent_to_signature_pending_at?: string;
  approved_by_senior_manager_at?: string;
  approved_by_head_of_it_at?: string;
  approved_by_dgm_at?: string;
  paid_at?: string;
  current_approver?: string;
  documents?: string[];
}

export interface CostCenter {
  cost_center_id: number;
  cost_center_code: string;
  cost_center_name: string;
  cost_center_type: string;
}

export interface Account {
  account_id: number;
  account_number: string;
  account_name: string;
  account_type: string;
}

export interface SubscriptionHistoryItem {
  itd_no: string;
  month: string;
  price: number;
  date: string;
  is_current: boolean;
}

export interface PaymentCertificate {
  certificate_no: string;
  itd_no: string;
  amount_certified: number;
  status: string;
  approver1_status: string;
  approver1_name: string;
  approver1_date?: string;
  approver2_status: string;
  approver2_name: string;
  approver2_date?: string;
  approver3_status: string;
  approver3_name: string;
  approver3_date?: string;
  approver4_status: string;
  approver4_name: string;
  approver4_date?: string;
  remarks?: string;
  created_at: string;
  updated_at: string;
  invoice?: Invoice;
}

export interface DashboardStats {
  total_invoices: number;
  pending_invoices: number;
  approved_invoices: number;
  completed_invoices: number;
  cancelled_invoices: number;
  total_certificates: number;
  certified_amount_sum: number;
  pending_approvals: number;
  fully_approved_certs: number;
}

export interface PaginatedInvoices {
  items: Invoice[];
  total: number;
  page: number;
  size: number;
  total_pages: number;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private apiUrl = 'http://127.0.0.1:8000/api';
  private currentUserSubject = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      try {
        this.currentUserSubject.next(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('authToken');
      }
    }
  }

  public get currentUserValue() {
    return this.currentUserSubject.value;
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/login`, { username, password }).pipe(
      tap(res => {
        if (res && res.token) {
          localStorage.setItem('authToken', res.token);
          localStorage.setItem('currentUser', JSON.stringify(res.user));
          this.currentUserSubject.next(res.user);
        }
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/logout`, {}).pipe(
      tap(() => {
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        this.currentUserSubject.next(null);
      })
    );
  }

  // Dashboard Stats
  getStats(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>(`${this.apiUrl}/dashboard/stats`);
  }

  // Vendors
  getVendors(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/vendors`);
  }

  // Invoice CRUD
  getInvoices(filters?: { [key: string]: string }, page: number = 1, size: number = 5): Observable<PaginatedInvoices> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    if (filters) {
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          params = params.set(key, filters[key]);
        }
      });
    }
    return this.http.get<PaginatedInvoices>(`${this.apiUrl}/invoices`, { params });
  }

  getInvoice(itdNo: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.apiUrl}/invoices/${itdNo}`);
  }

  getNextItdNo(): Observable<{ next_itd_no: string }> {
    return this.http.get<{ next_itd_no: string }>(`${this.apiUrl}/invoices/next-itd`);
  }

  getPoSummary(poNumber: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/po-delivery-summary/${encodeURIComponent(poNumber)}`);
  }

  createInvoice(invoice: Invoice, files?: File[]): Observable<Invoice> {
    const formData = new FormData();
    formData.append('invoice_data_str', JSON.stringify(invoice));
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i], files[i].name);
      }
    }
    return this.http.post<Invoice>(`${this.apiUrl}/invoices`, formData);
  }

  updateInvoice(itdNo: string, invoice: Partial<Invoice>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.apiUrl}/invoices/${itdNo}`, invoice);
  }

  deleteInvoice(itdNo: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/invoices/${itdNo}`);
  }

  getInvoiceDocuments(itdNo: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/invoices/${itdNo}/documents`);
  }

  uploadInvoiceDocuments(itdNo: string, files: File[]): Observable<any> {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i], files[i].name);
    }
    return this.http.post<any>(`${this.apiUrl}/invoices/${itdNo}/documents`, formData);
  }

  deleteInvoiceDocument(itdNo: string, filename: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/invoices/${itdNo}/documents/${encodeURIComponent(filename)}`);
  }

  getDocumentUrl(itdNo: string, filename: string): string {
    return `${this.apiUrl}/invoices/${itdNo}/documents/${encodeURIComponent(filename)}`;
  }

  getCostCenters(): Observable<CostCenter[]> {
    return this.http.get<CostCenter[]>(`${this.apiUrl}/cost-centers`);
  }

  getAccounts(): Observable<Account[]> {
    return this.http.get<Account[]>(`${this.apiUrl}/accounts`);
  }

  getSubscriptionHistory(itdNo: string): Observable<SubscriptionHistoryItem[]> {
    return this.http.get<SubscriptionHistoryItem[]>(`${this.apiUrl}/invoices/${itdNo}/subscription-history`);
  }

  approveInvoice(itdNo: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.apiUrl}/invoices/${itdNo}/approve`, {});
  }

  rejectInvoice(itdNo: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.apiUrl}/invoices/${itdNo}/reject`, {});
  }

  correctInvoice(itdNo: string, updates: Partial<Invoice>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.apiUrl}/invoices/${itdNo}/correct`, updates);
  }

  cancelInvoice(itdNo: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.apiUrl}/invoices/${itdNo}/cancel`, {});
  }

  // Certificate CRUD
  getCertificates(): Observable<PaymentCertificate[]> {
    return this.http.get<PaymentCertificate[]>(`${this.apiUrl}/certificates`);
  }

  getCertificate(certificateNo: string): Observable<PaymentCertificate> {
    return this.http.get<PaymentCertificate>(`${this.apiUrl}/certificates/${certificateNo}`);
  }

  createCertificate(cert: { itd_no: string; amount_certified: number; remarks?: string }): Observable<PaymentCertificate> {
    return this.http.post<PaymentCertificate>(`${this.apiUrl}/certificates`, cert);
  }

  approveCertificate(
    certificateNo: string,
    approval: { approver_role: string; action: string; remarks?: string }
  ): Observable<PaymentCertificate> {
    return this.http.post<PaymentCertificate>(`${this.apiUrl}/certificates/${certificateNo}/approve`, approval);
  }
}
