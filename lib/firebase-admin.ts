import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Firebase Admin configuration using service account
const serviceAccount = {
    type: "service_account",
    project_id: "zerokm-64d2f",
    private_key_id: "6ef02ecf3042ef1a099d828ef07fd755bcde7b99",
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') ||
        "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDySIgOwZtFev0E\n/xH21ZmjQyBRuDfSsiYKWQx4agjOoYP/oK9BCRMDIDmkUGa10UYhjpbPBf91SPOu\nZK1VNxcd9Xbs9Cba3MlmkPlJAenArCavPqVIYS3PCHumuRWWssPdsfe1rWY6BuBb\nlRi+Hu7MGmu7i7Jkpz0xrHqHzCfqO9s2eNhXHiWECDipmEhdobmhqZAwSvPtq0d7\nfaH3HmotJud4F2dLlc6giPch00lAvPAhvXDIIXufyBzFcytVTuTrFwgkdepgerYa\nzK3o+5wlbd1wp5qmx7Hhs/POZsu9sCTeYwSZdqMJuBB8bA3PvledegKvrP41wlhD\nP1NWV35pAgMBAAECggEAH7vH9PrUbgN1BsWr4i3JoPHRVrLEvlguwFXihWu0pJp7\ncgISAk2Adn0u35Us/BfMJ5KysQHtmucyYj9LLqlNDKj9FH3JZbWGZuSKf3lR1wu/\n813GretrNxM63Ymfc2y4V8i6vkqBubbzMDuf5oL3BGJaMFHUofdU/gpucBaZjHBd\nAEvjcmoJB8AuDcF7qOutbNcGOu1v34wUw3MWBffutGRYLFCI3Am+C7qbVJuReDl0\nJ/P2dtd7sNRuVzJ93EpoL6tyCJDteoL240qJEEAs76hJaj5UaaY6urYq0/T+pMqb\nifMrzCQo/Aqa61LFpCaeEQLHSLS9v5Sirhet/HcYkwKBgQD77PWWDEprMgzl99ab\nQ9cm1pzNYYrTQpl7jZCxamxQRt6m40whciZK+SC8sydmukVUbN73heZIorsCVy+M\nIDZ48UjWim7n7GiEss7Avd6wDfzVOp4H6qw0Ls2jCEZohac126PJxlyVlfltjuhY\nmIajBKBm6cgwuEE2XyDYs1PrhwKBgQD2M6aCD5LBBaHbvDvC3qvKS0/zhAwts5r5\nt65bF6okoFb1UmQJ30NX2VocKj1MCDd3ZjDrEi/o9lE/9bPhfd3hAYQPtj3X/xma\nJ1Y6bXfWraVcN9CFaMa57d0jfkCPJTVx/7LgHzzLDdSCGCBm0STXMEI3MFF0wDF4\nk4UvExkijwKBgEymWEKDEtFytQHzWlR7W6bxfVvv5bFJfjFdbTzNyI7UQUI9vhgf\nBw+gpRlE2SQkYJvDVEOzddF70bJwnILh+jDqGONN01i1UUeur8FtA6hFWTv3TcXS\n3Pozk1WbWvDKWYnFfhwSQnEw5Gc1J/Rs0+odqkAluUc5iH3mi7PjPBFZAoGBAJ31\nD2w8j5w1f94Zy4HAGRnF7fq/ioy7wb9bYIrjCO9My93DSZmn223+bjjJxOAGGYgK\nUXJQDdr6RbCydAFFHtigf1kRRGZTLdrgSAtedleOuxwKV0dwrKdXe9yswMDWT47f\nTaVLhVaFfgUlc4xjvK4vMRx1bJ1qPZMtmnJUX3jzAoGAOoEyaucyu0FKEpJM3fgl\nacBuGJoFffg5a5o6c31U/PYd0zZiz1q+70lNIWagI1WovXH2lZ2fvyLrRKEG3L8E\nOb4T8qMVqLiGrEunPowhQUQLla4AgP5xPV1Z0TqumrcrD5XQ8DkPvM7TYHN6f0AV\ngnD9MaWbD8cx5xzzDRhb0Pk=\n-----END PRIVATE KEY-----\n",
    client_email: "firebase-adminsdk-fbsvc@zerokm-64d2f.iam.gserviceaccount.com",
    client_id: "116364304718778091627",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40zerokm-64d2f.iam.gserviceaccount.com",
    universe_domain: "googleapis.com"
};

// Initialize Firebase Admin App
const adminApp = !getApps().find(app => app?.name === 'admin')
    ? initializeApp({
        credential: cert(serviceAccount as any),
        projectId: 'zerokm-64d2f'
    }, 'admin')
    : getApps().find(app => app?.name === 'admin')!;

// Get Auth instance
export const adminAuth = getAuth(adminApp);
export { adminApp };