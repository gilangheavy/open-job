import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Service } from './s3.service';

const mockS3Send = jest.fn();
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<
  typeof getSignedUrl
>;

jest.mock('@aws-sdk/client-s3', () => {
  const actual =
    jest.requireActual<typeof import('@aws-sdk/client-s3')>(
      '@aws-sdk/client-s3',
    );
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  };
});
jest.mock('@aws-sdk/s3-request-presigner');

const S3_CONFIG = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
  S3_BUCKET_NAME: 'openjob',
};

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => S3_CONFIG[key as keyof typeof S3_CONFIG],
          },
        },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  afterEach(() => jest.clearAllMocks());

  // -----------------------------------------------------------------------
  // uploadFile
  // -----------------------------------------------------------------------
  describe('uploadFile()', () => {
    it('should call PutObjectCommand with correct params and return the object key', async () => {
      mockS3Send.mockResolvedValueOnce({});

      const buffer = Buffer.from('pdf-content');
      const key = await service.uploadFile(
        buffer,
        'documents/uuid/123-resume.pdf',
        'application/pdf',
      );

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: S3_CONFIG.S3_BUCKET_NAME,
        Key: 'documents/uuid/123-resume.pdf',
        Body: buffer,
        ContentType: 'application/pdf',
      });
      expect(key).toBe('documents/uuid/123-resume.pdf');
    });

    it('should propagate errors from S3 client', async () => {
      mockS3Send.mockRejectedValueOnce(new Error('S3 unavailable'));

      await expect(
        service.uploadFile(Buffer.from('data'), 'key', 'application/pdf'),
      ).rejects.toThrow('S3 unavailable');
    });
  });

  // -----------------------------------------------------------------------
  // deleteFile
  // -----------------------------------------------------------------------
  describe('deleteFile()', () => {
    it('should call DeleteObjectCommand with the correct key', async () => {
      mockS3Send.mockResolvedValueOnce({});

      await service.deleteFile('documents/uuid/123-resume.pdf');

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: S3_CONFIG.S3_BUCKET_NAME,
        Key: 'documents/uuid/123-resume.pdf',
      });
    });
  });

  // -----------------------------------------------------------------------
  // getPresignedUrl
  // -----------------------------------------------------------------------
  describe('getPresignedUrl()', () => {
    it('should return a presigned URL for the given key with TTL 3600', async () => {
      const fakeUrl =
        'https://minio/openjob/documents/uuid/123-resume.pdf?X-Amz-Signature=abc';
      mockGetSignedUrl.mockResolvedValueOnce(fakeUrl);

      const url = await service.getPresignedUrl(
        'documents/uuid/123-resume.pdf',
      );

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: S3_CONFIG.S3_BUCKET_NAME,
        Key: 'documents/uuid/123-resume.pdf',
      });
      const [, , options] = mockGetSignedUrl.mock.calls[0] as [
        S3Client,
        GetObjectCommand,
        { expiresIn: number },
      ];
      expect(options.expiresIn).toBe(3600);
      expect(url).toBe(fakeUrl);
    });
  });
});
