import { TestBed } from '@angular/core/testing';

import { JoinFeaturesService } from './join-features';

describe('JoinFeaturesService', () => {
  let service: JoinFeaturesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JoinFeaturesService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
