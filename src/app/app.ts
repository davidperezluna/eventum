import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaInstallBanner } from './components/pwa-install-banner/pwa-install-banner';
import { PwaUpdateService } from './services/pwa-update.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaInstallBanner],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('admin-panel');
  private readonly pwaUpdate = inject(PwaUpdateService);

  ngOnInit(): void {
    this.pwaUpdate.init();
  }
}
