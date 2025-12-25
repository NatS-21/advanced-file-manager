export interface AuthJwtPayload {
  uid: number;
  tid: number;
  email: string;
}

export interface AuthContext {
  userId: number;
  teamId: number;
  email: string;
}


