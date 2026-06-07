import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  ClientConfirmDialogService,
  ClientConfirmDialogState,
} from '../../services/client-confirm-dialog.service';

@Component({
  selector: 'app-client-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-confirm-dialog.html',
  styleUrl: './client-confirm-dialog.css',
})
export class ClientConfirmDialog implements OnDestroy {
  state: ClientConfirmDialogState = { open: false };
  private subscription?: Subscription;

  constructor(private readonly confirmDialog: ClientConfirmDialogService) {
    this.subscription = this.confirmDialog.state$.subscribe((state) => {
      this.state = state;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  cancel(): void {
    this.confirmDialog.respond(false);
  }

  confirm(): void {
    this.confirmDialog.respond(true);
  }

  get openState(): Extract<ClientConfirmDialogState, { open: true }> | null {
    return this.state.open ? this.state : null;
  }
}
