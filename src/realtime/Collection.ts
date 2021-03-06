import { DataCollection } from "../drivers/DataCollection";
import { DataDocument } from "../drivers/DataDocument";
import { IDataDriver } from "../drivers/IDataDriver";
import { ChangeSubject, ChangeType, INotifier } from "./INotifier";
import { v4 } from "uuid";
import { QueryModel } from "./QueryModel";

export class Collection implements DataCollection {
  id: string;
  parentId: string;
  name: string;

  protected _subCollections: Collection[] = [];
  protected _documents: DataDocument[] = [];

  constructor(
    protected driver: IDataDriver,
    protected notifier: INotifier,
    protected path: string,
    parentId: string,
    id: string,
    name: string
  ) {
    this.parentId = parentId;
    this.id = id;
    this.name = name;
    this._subCollections = [];
    this._documents = [];
  }

  public get subCollections() {
    return this._subCollections;
  }

  public get documents() {
    return this._documents;
  }

  public async fetch(loadDocument: boolean = false) {
    let result = await this.driver.getCollection(this.id);
    if (result.isError) {
      result = await this.driver.createCollection(this);
      if (result.isError) {
        console.error(result.error);
        return;
      }
    }
    /**
     * Get all sub collections
     */
    result = await this.driver.getSubCollections(this.id);
    if (!result.isError) {
      if (result.subCollections != undefined) {
        this._subCollections = result.subCollections.map(
          (c) =>
            new Collection(
              this.driver,
              this.notifier,
              this.path + "/" + c.name,
              this.id,
              c.id,
              c.name
            )
        );
      }
    }
    /**
     * Load docs
     */
    if (loadDocument) {
      result = await this.driver.getDocuments(this.id);
      if (!result.isError) {
        this._documents = result.docs ?? [];
      }
    }
  }

  public async createSubcollection(name: string) {
    let dupId = this._subCollections.findIndex((c) => c.name == name);
    if (dupId == -1) {
      let collectionId = v4();
      let result = await this.driver.createCollection({
        id: collectionId,
        name: name,
        parentId: this.id,
      });
      if (result.isError) {
        return new Error(result.error);
      }
      this._subCollections.push(
        new Collection(
          this.driver,
          this.notifier,
          this.path + "/" + name,
          this.id,
          collectionId,
          name
        )
      );
      this.notifier.notify(ChangeSubject.Collection, ChangeType.Added, {
        collectionId: collectionId,
        path: this.path,
      });
    }
  }

  public async deleteSubcollection(name: string) {
    let deleted = this._subCollections.findIndex((c) => c.name == name);
    if (deleted == -1) {
      return;
    }
    let deletedId = this._subCollections[deleted].id;
    let result = await this.driver.deleteCollection(deletedId);
    if (result.isError) {
      return new Error(result.error);
    }
    this._subCollections.splice(deleted, 1);
    this.notifier.notify(ChangeSubject.Collection, ChangeType.Deleted, {
      collectionId: deletedId,
      path: this.path,
    });
  }

  public async createDocument(value: any, key?: string) {
    let dupId = this._documents.findIndex((d) => d.key == key);
    let result = null;
    if (dupId == -1) {
      let docId = v4();
      result = await this.driver.createDocument({
        id: docId,
        parentId: this.id,
        value: value,
        key: key ?? docId,
      });
      if (result.isError) {
        return new Error(result.error);
      }
      this._documents.push({
        id: docId,
        parentId: this.id,
        value: value,
        key: key ?? docId,
      });
      this.notifier.notify(ChangeSubject.Document, ChangeType.Added, {
        collectionId: this.id,
        key: key ?? docId,
        value: value,
        path: this.path,
      });
    } else {
      result = await this.driver.updateDocument(
        this._documents[dupId].id,
        value
      );
      if (result.isError) {
        return new Error(result.error);
      }
      this._documents[dupId].value = value;
      this.notifier.notify(ChangeSubject.Document, ChangeType.Updated, {
        collectionId: this.id,
        path: this.path,
        key: key,
        value: value,
      });
    }
  }
  public async updateDocument(value: any, key?: string) {
    let checkKey = this._documents.findIndex((d) => d.key == key);
    let docId = v4();
    if (checkKey == -1) {
      let newDoc: DataDocument = {
        id: docId,
        parentId: this.id,
        value: value,
        key: key ?? docId,
      };
      let result = await this.driver.createDocument(newDoc);
      if (result.isError) {
        return new Error(result.error);
      }
      this._documents.push(newDoc);
      this.notifier.notify(ChangeSubject.Document, ChangeType.Added, {
        collectionId: this.id,
        key: key ?? docId,
        value: value,
        path: this.path,
      });
    } else {
      await this.driver.updateDocument(this.id, value);
      this._documents[checkKey].value = value;
      this.notifier.notify(ChangeSubject.Document, ChangeType.Updated, {
        collectionId: this.id,
        key: key,
        value: value,
        path: this.path,
      });
    }
  }
  public async deleteDocument(key: string) {
    let checkId = this._documents.findIndex((d) => d.key == key);
    if (checkId == -1) {
      return;
    }
    let result = await this.driver.deleteDocument(this._documents[checkId].id);
    if (result.isError) {
      return new Error(result.error);
    }
    this._documents.splice(checkId, 1);
    this.notifier.notify(ChangeSubject.Document, ChangeType.Deleted, {
      collectionId: this.id,
      key: key,
      path: this.path,
    });
  }
  public async query(q: QueryModel) {
    let result = await this.driver.queryDocuments(this.id, q);
    this.notifier.notify(ChangeSubject.Document, ChangeType.Query, {
      collectionId: this.id,
      path: q.collectionPath,
      docs: result.docs ?? []
    });
  }
}
