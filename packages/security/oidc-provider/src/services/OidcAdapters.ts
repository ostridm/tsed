import {Adapter, Adapters} from "@tsed/adapters";
import {Inject, Injectable} from "@tsed/di";
import {Adapter as OidcAdapter, AdapterConstructor} from "oidc-provider";

export type OidcAdapterMethods<Model = any> = Adapter<Model> & Partial<Omit<OidcAdapter, "upsert">>;

@Injectable()
export class OidcAdapters {
  @Inject()
  protected adapters: Adapters;

  createAdapterClass(): AdapterConstructor {
    const self = this;

    return class CustomAdapter implements OidcAdapter {
      adapter: OidcAdapterMethods;

      constructor(name: string) {
        this.adapter = self.adapters.invokeAdapter<any>({
          collectionName: name,
          model: Object
        }) as OidcAdapterMethods;
      }

      async upsert(id: string, payload: any, expiresIn: number): Promise<void> {
        let expiresAt;

        if (expiresIn) {
          expiresAt = new Date(Date.now() + expiresIn * 1000);
        }

        await this.adapter.upsert(id, payload, expiresAt);
      }

      async find(id: string) {
        return this.adapter.findById(id);
      }

      async findByUserCode(userCode: string) {
        // istanbul ignore next
        if (this.adapter.findByUserCode) {
          return this.adapter.findByUserCode(userCode);
        }

        return this.adapter.findOne({
          userCode
        });
      }

      async findByUid(uid: string) {
        // istanbul ignore next
        if (this.adapter.findByUid) {
          return this.adapter.findByUid(uid);
        }

        return this.adapter.findOne({
          uid
        });
      }

      async destroy(id: string) {
        // istanbul ignore next
        if (this.adapter.destroy) {
          return this.adapter.destroy(id);
        }

        await this.adapter.deleteById(id);
      }

      async revokeByGrantId(grantId: string) {
        // istanbul ignore next
        if (this.adapter.revokeByGrantId) {
          return this.adapter.revokeByGrantId(grantId);
        }

        await this.adapter.deleteMany({grantId});
      }

      async consume(grantId: string) {
        // istanbul ignore next
        if (this.adapter.consume) {
          return this.adapter.consume(grantId);
        }

        await this.adapter.update(grantId, {consumed: Math.floor(Date.now() / 1000)});
      }
    };
  }
}
