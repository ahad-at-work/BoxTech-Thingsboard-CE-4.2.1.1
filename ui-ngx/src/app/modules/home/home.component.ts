///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { AfterViewInit, Component, ElementRef, Inject, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { skip, startWith, Subject, take } from 'rxjs';
import { Store } from '@ngrx/store';
import { debounceTime, distinctUntilChanged, filter, takeUntil } from 'rxjs/operators';

import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { PageComponent } from '@shared/components/page.component';
import { AppState } from '@core/core.state';
import { getCurrentAuthState, selectAuth } from '@core/auth/auth.selectors';
import { MediaBreakpoints } from '@shared/models/constants';
import screenfull from 'screenfull';
import { MatSidenav } from '@angular/material/sidenav';
import { AuthState } from '@core/auth/auth.models';
import { WINDOW } from '@core/services/window.service';
import { instanceOfSearchableComponent, ISearchableComponent } from '@home/models/searchable-component.models';
import { ActiveComponentService } from '@core/services/active-component.service';
import { RouterTabsComponent } from '@home/components/router-tabs.component';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { isDefined, isDefinedAndNotNull } from '@core/utils';
import { MenuService } from '@core/services/menu.service';
import { Authority } from '@shared/models/authority.enum';
import { MenuId, MenuSection } from '@core/services/menu.models';
@Component({
  selector: 'tb-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss', './home-glass.component.scss']
})
export class HomeComponent extends PageComponent implements AfterViewInit, OnInit, OnDestroy {

  authState: AuthState = getCurrentAuthState(this.store);
  forceFullscreen = this.authState.forceFullscreen;
  // TME customer-scoped theme detection (Trakker Middle East)
  // NOTE: recomputed reactively in ngOnInit (not just here) — HomeComponent
  // persists across "Login as customer" switches (no full page reload, no
  // component recreation), so a one-time snapshot here goes stale the moment
  // an admin uses that shortcut. See per-customer-theming-playbook.md §1.4-ish.
  isTmeCustomer = this.authState.userDetails?.customerId?.id === '57a0fa00-8d00-11f1-9902-cdf828be2d57';
  isCustomerUser = this.authState.authUser.authority === Authority.CUSTOMER_USER;



  activeComponent: any;
  searchableComponent: ISearchableComponent;

  sidenavMode: 'over' | 'push' | 'side' = 'side';
  sidenavOpened = true;
  sidebarCollapsed = false;
  isMobileSidebar = false;
  logo = 'assets/boxtech-logo.png';

  @ViewChild('sidenav')
  sidenav: MatSidenav;

  @ViewChild('sidenav', {read: ElementRef})
  sidenavElement: ElementRef<HTMLElement>;

  @ViewChild('sidenavHotzone')
  sidenavHotzone: ElementRef<HTMLElement>;

  // BoxTech auto-hide sidebar: open on Home; on every other tab (unless
  // pinned) it slides away and re-appears while the pointer rests on the
  // left screen edge.
  // Reveal/hide runs outside the Angular zone and only flips a CSS class, so
  // hovering never triggers change detection.
  sidebarPinned = HomeComponent.loadSidebarPinned();
  sidebarDocked = this.sidebarPinned;
  isDesktop = true;
  private revealTimer: ReturnType<typeof setTimeout>;
  private hideTimer: ReturnType<typeof setTimeout>;
  private removeSidenavListeners: Array<() => void> = [];

  @ViewChild('searchInput') searchInputField: ElementRef;

  fullscreenEnabled = screenfull.isEnabled;

  searchEnabled = false;
  showSearch = false;
  textSearch = this.fb.control('', {nonNullable: true});

  hideLoadingBar = false;

  private destroy$ = new Subject<void>();
  availableLinks$ = this.menuService.availableMenuLinks();
  searchQuery = '';
  searchResults: MenuSection[] = [];
  searchOpen = false;

  onSearchInput(query: string): void {
    this.searchQuery = query;
    if (!query.trim()) {
      this.searchResults = [];
      this.searchOpen = false;
      return;
    }
    this.availableLinks$.pipe(take(1)).subscribe(links => {
      this.searchResults = links.filter(link =>
        link.name && link.name.toLowerCase().includes(query.toLowerCase()) && link.path
      );
      this.searchOpen = this.searchResults.length > 0;
    });
  }

  navigateToResult(path: string): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.searchOpen = false;
    this.router.navigate([path]);
  }

  closeSidebarSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.searchOpen = false;
  }

  entitiesLinks$ = this.menuService.menuLinksByIds([
    MenuId.devices, MenuId.assets, MenuId.entity_views, MenuId.gateways
  ]);
  profilesLinks$ = this.menuService.menuLinksByIds([
    MenuId.device_profiles, MenuId.asset_profiles
  ]);
  resourcesLinks$ = this.menuService.menuLinksByIds([
    MenuId.widget_library, MenuId.images, MenuId.scada_symbols,
    MenuId.javascript_library, MenuId.resources_library
  ]);

  // One-line hints under each header dropdown item (keyed by menu path).
  readonly topbarDescriptions: {[path: string]: string} = {
    '/entities/devices': 'Connected hardware and telemetry',
    '/entities/assets': 'Sites, machines and things you track',
    '/entities/entityViews': 'Scoped views of devices and assets',
    '/entities/gateways': 'Gateways and their connectors',
    '/profiles/deviceProfiles': 'Transport, alarm rules and provisioning',
    '/profiles/assetProfiles': 'Defaults for each asset type',
    '/resources/widgets-library': 'Widget bundles and widget types',
    '/resources/images': 'Uploaded images and icons',
    '/resources/scada-symbols': 'Symbols for SCADA dashboards',
    '/resources/javascript-library': 'Reusable JavaScript modules',
    '/resources/resources-library': 'Files, certificates and models'
  };

  // Icons for header dropdown items whose stock menu icon is a letter tile.
  readonly topbarIcons: {[path: string]: string} = {
    '/profiles/deviceProfiles': 'phonelink_setup',
    '/profiles/assetProfiles': 'home_work'
  };

  isUrlActive(prefix: string): boolean {
    const path = this.router.url.split(/[?#;]/)[0];
    return path === prefix || path.startsWith(prefix + '/');
  }
  

  toggleSidebarCollapsed(): void {
    if (this.isMobileSidebar) {
      return;
    }
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  get sidebarAutoHide(): boolean {
    return this.isDesktop && !this.isTmeCustomer && !this.sidebarDocked;
  }

  // Pin lasts for the current session only, so a reload always brings back auto-hide.
  toggleSidebarDocked(): void {
    this.sidebarDocked = !this.sidebarDocked;
    this.sidebarPinned = this.sidebarDocked && !this.isHomeUrl(this.router.url);
    this.hideSidenav();
  }

  private static loadSidebarPinned(): boolean {
    try {
      // Drop the pin that earlier builds persisted across reloads.
      localStorage.removeItem('tb_boxtech_sidebar_pinned');
    } catch (e) {}
    return false;
  }

  private onNavigationEnd() {
    // Open on Home; slides away on every other tab (unless pinned).
    this.sidebarDocked = this.sidebarPinned || this.isHomeUrl(this.router.url);
    if (this.sidebarAutoHide && this.isPointerOverSidenav()) {
      // Clicked a tab inside the sidebar: stay open while the pointer is on it;
      // the mouseleave listener starts hiding as soon as it moves away.
      this.revealSidenav();
    } else {
      this.hideSidenav();
    }
    this.updatePageTitle();
  }

  private isPointerOverSidenav(): boolean {
    return !!(this.sidenavElement?.nativeElement.matches(':hover') ||
      this.sidenavHotzone?.nativeElement.matches(':hover'));
  }

  private isHomeUrl(url: string): boolean {
    return url.split(/[?#;]/)[0].replace(/\/+$/, '') === '/home';
  }

  // Header title: the deepest route's `title` data (same key the browser tab title uses).
  pageTitle = '';
  private updatePageTitle() {
    let route = this.router.routerState.snapshot.root;
    let title = '';
    while (route) {
      if (route.data?.title) {
        title = route.data.title;
      }
      route = route.firstChild;
    }
    this.pageTitle = title;
  }

  // First load: slide the sidebar in so users see where it lives, then let it
  // tuck away (unless the pointer is resting on it).
  private introduceSidenav() {
    if (!this.sidebarAutoHide) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.revealSidenav();
        this.scheduleHideSidenav(1600);
      }, 350);
    });
  }

  private revealSidenav() {
    clearTimeout(this.hideTimer);
    if (this.sidebarAutoHide) {
      this.sidenavElement?.nativeElement.classList.add('tb-sidenav-revealed');
    }
  }

  private hideSidenav() {
    clearTimeout(this.revealTimer);
    clearTimeout(this.hideTimer);
    this.sidenavElement?.nativeElement.classList.remove('tb-sidenav-revealed');
  }

  private scheduleHideSidenav(delay = 180) {
    clearTimeout(this.revealTimer);
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      const sidenavEl = this.sidenavElement?.nativeElement;
      const hovered = this.isPointerOverSidenav();
      // Keep the sidebar open while a menu opened from it (e.g. account menu) is showing.
      const overlayMenuOpen = !!this.window.document.querySelector('.cdk-overlay-container .mat-mdc-menu-panel');
      if (hovered || overlayMenuOpen) {
        this.scheduleHideSidenav(400);
      } else {
        sidenavEl?.classList.remove('tb-sidenav-revealed');
      }
    }, delay);
  }

  private bindSidenavHoverListeners() {
    const sidenavEl = this.sidenavElement?.nativeElement;
    const hotzoneEl = this.sidenavHotzone?.nativeElement;
    if (!sidenavEl || !hotzoneEl) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      const listen = (el: HTMLElement, event: string, handler: () => void) => {
        el.addEventListener(event, handler, {passive: true});
        this.removeSidenavListeners.push(() => el.removeEventListener(event, handler));
      };
      listen(hotzoneEl, 'mouseenter', () => {
        clearTimeout(this.hideTimer);
        clearTimeout(this.revealTimer);
        this.revealTimer = setTimeout(() => this.revealSidenav(), 60);
      });
      listen(hotzoneEl, 'mouseleave', () => {
        if (!sidenavEl.classList.contains('tb-sidenav-revealed')) {
          clearTimeout(this.revealTimer);
        }
      });
      listen(sidenavEl, 'mouseenter', () => clearTimeout(this.hideTimer));
      listen(sidenavEl, 'mouseleave', () => {
        if (this.sidebarAutoHide) {
          this.scheduleHideSidenav();
        }
      });
    });
  }

  constructor(protected store: Store<AppState>,
              @Inject(WINDOW) private window: Window,
              private activeComponentService: ActiveComponentService,
              private fb: FormBuilder,
              private menuService: MenuService,
              private router: Router,
              private ngZone: NgZone,
              public breakpointObserver: BreakpointObserver) {
    super(store);
  }

  ngOnInit() {
    this.store.select(selectAuth)
      .pipe(takeUntil(this.destroy$))
      .subscribe((authState: AuthState) => {
        this.authState = authState;
        this.isTmeCustomer = authState.userDetails?.customerId?.id === '57a0fa00-8d00-11f1-9902-cdf828be2d57';
        this.isCustomerUser = authState.authUser?.authority === Authority.CUSTOMER_USER;
        if (!this.isTmeCustomer) {
          // The icon-rail collapse is a TME-only feature; BoxTech uses dock / auto-hide.
          this.sidebarCollapsed = false;
        }
        document.body.classList.toggle('tb-theme-tme-active', this.isTmeCustomer);
      });

    this.sidebarDocked = this.sidebarPinned || this.isHomeUrl(this.router.url);
    this.updatePageTitle();
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => this.onNavigationEnd());

    const isGtSm = this.breakpointObserver.isMatched(MediaBreakpoints['gt-sm']);
    this.sidenavMode = isGtSm ? 'side' : 'over';
    this.sidenavOpened = isGtSm;
    this.isDesktop = isGtSm;

    this.breakpointObserver
      .observe(MediaBreakpoints['gt-sm'])
      .pipe(takeUntil(this.destroy$))
      .subscribe((state: BreakpointState) => {
          this.isDesktop = state.matches;
          if (state.matches) {
            this.sidenavMode = 'side';
            this.sidenavOpened = true;
          } else {
            this.sidenavMode = 'over';
            this.sidenavOpened = false;
            this.sidebarCollapsed = false;
          }
        }
      );

    this.breakpointObserver
      .observe('(max-width: 959px)')
      .pipe(takeUntil(this.destroy$))
      .subscribe((state: BreakpointState) => {
          this.isMobileSidebar = state.matches;
          if (state.matches) {
            this.sidebarCollapsed = false;
          }
        }
      );
  }

  ngOnDestroy() {
    document.body.classList.remove('tb-theme-tme-active');
    clearTimeout(this.revealTimer);
    clearTimeout(this.hideTimer);
    this.removeSidenavListeners.forEach(remove => remove());
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit() {
    this.bindSidenavHoverListeners();
    this.introduceSidenav();
    this.textSearch.valueChanges.pipe(
      debounceTime(150),
      startWith(''),
      distinctUntilChanged((a: string, b: string) => a.trim() === b.trim()),
      skip(1),
      takeUntil(this.destroy$)
    ).subscribe(value => this.searchTextUpdated(value.trim()));
  }

  sidenavClicked() {
    if (this.sidenavMode === 'over' && !this.sidebarAutoHide) {
      this.sidenav.toggle();
    }
  }

  toggleFullscreen() {
    if (screenfull.isEnabled) {
      screenfull.toggle();
    }
  }

  isFullscreen() {
    return screenfull.isFullscreen;
  }

  goBack() {
    this.window.history.back();
  }

  activeComponentChanged(activeComponent: any) {
    this.activeComponentService.setCurrentActiveComponent(activeComponent);
    if (!this.activeComponent) {
      setTimeout(() => {
        this.updateActiveComponent(activeComponent);
      }, 0);
    } else {
      this.updateActiveComponent(activeComponent);
    }
  }

  private updateActiveComponent(activeComponent: any) {
    this.showSearch = false;
    this.hideLoadingBar = false;
    this.textSearch.reset('', {emitEvent: false});
    this.activeComponent = activeComponent;

    if (activeComponent && activeComponent instanceof RouterTabsComponent
      && isDefinedAndNotNull(this.activeComponent.activatedRoute?.snapshot?.data?.showMainLoadingBar)) {
      this.hideLoadingBar = !this.activeComponent.activatedRoute.snapshot.data.showMainLoadingBar;
    } else if (activeComponent && activeComponent instanceof PageComponent
      && isDefinedAndNotNull(this.activeComponent?.showMainLoadingBar)) {
      this.hideLoadingBar = !this.activeComponent.showMainLoadingBar;
    }

    if (this.activeComponent && instanceOfSearchableComponent(this.activeComponent)) {
      this.searchEnabled = true;
      this.searchableComponent = this.activeComponent;
    } else {
      this.searchEnabled = false;
      this.searchableComponent = null;
    }
  }

  displaySearchMode(): boolean {
    return this.searchEnabled && this.showSearch;
  }

  openSearch() {
    if (this.searchEnabled) {
      this.showSearch = true;
      setTimeout(() => {
        this.searchInputField.nativeElement.focus();
        this.searchInputField.nativeElement.setSelectionRange(0, 0);
      }, 10);
    }
  }

  closeSearch() {
    if (this.searchEnabled) {
      this.showSearch = false;
      if (this.textSearch.value.length) {
        this.textSearch.reset();
      }
    }
  }

  private searchTextUpdated(searchText: string) {
    if (this.searchableComponent) {
      this.searchableComponent.onSearchTextUpdated(searchText);
    }
  }
}
