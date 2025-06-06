import { TestBed } from '@angular/core/testing';

import { UploadShapefile } from './upload-shapefile';

describe('UploadShapefile', () => {
  let service: UploadShapefile;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UploadShapefile);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
