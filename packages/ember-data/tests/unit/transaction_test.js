/*global QUnit*/

var get = Ember.get, set = Ember.set;

var Person = DS.Model.extend({
  name: DS.attr('string'),
  foo: DS.attr('string')
});

var transaction;

module("DS.Transaction", {
  teardown: function() {
    if (transaction) { transaction.destroy(); }
  }
});

test("can create a new transaction", function() {
  var store = DS.Store.create();

  transaction = store.transaction();

  ok(transaction, "transaction is created");
  ok(DS.Transaction.detectInstance(transaction), "transaction is an instance of DS.Transaction");
});

test("after a record is created from a transaction, it is not committed when store.commit() is called but is committed when transaction.commit() is called", function() {
  var commitCalls = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      createRecords: function() {
        commitCalls++;
      }
    })
  });

  transaction = store.transaction();
  transaction.createRecord(Person, {});

  store.commit();
  equal(commitCalls, 0, "commit was not called when committing the store");

  transaction.commit();
  equal(commitCalls, 1, "commit was called when committing the transaction");
});

test("after a record is added to a transaction then updated, it is not committed when store.commit() is called but is committed when transaction.commit() is called", function() {
  var commitCalls = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      updateRecords: function() {
        commitCalls++;
      }
    })
  });

  store.load(Person, { id: 1, name: "Yehuda Katz" });

  transaction = store.transaction();
  var record = store.find(Person, 1);
  transaction.add(record);

  record.set('name', 'Brohuda Brokatz');

  store.commit();
  equal(commitCalls, 0, "commit was not called when committing the store");

  transaction.commit();
  equal(commitCalls, 1, "commit was called when committing the transaction");
});

test("a record is removed from a transaction after the records become clean", function() {
  var createCalls = 0, updateCalls = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      createRecord: function(store, type, record) {
        createCalls++;

        store.didCreateRecord(record, { id: 1 });
      },

      updateRecords: function() {
        updateCalls++;
      }
    })
  });

  transaction = store.transaction();
  var record = transaction.createRecord(Person, {});

  transaction.commit();
  equal(createCalls, 1, "create should be called when committing the store");

  record.set('foo', 'bar');

  transaction.commit();
  equal(updateCalls, 0, "commit was not called when committing the transaction");

  store.commit();
  equal(updateCalls, 1, "commit was called when committing the store");
});

test("after a record is added to a transaction then deleted, it is not committed when store.commit() is called but is committed when transaction.commit() is called", function() {
  var commitCalls = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      deleteRecords: function() {
        commitCalls++;
      }
    })
  });

  store.load(Person, { id: 1, name: "Yehuda Katz" });

  transaction = store.transaction();
  var record = store.find(Person, 1);
  transaction.add(record);

  record.deleteRecord();

  store.commit();
  equal(commitCalls, 0, "commit was not called when committing the store");

  transaction.commit();
  equal(commitCalls, 1, "commit was called when committing the transaction");
});

test("a record that is clean can be removed from a transaction", function() {
  var updateCalled = 0;

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      updateRecord: function() {
        updateCalled++;
      }
    })
  });

  store.load(Person, { id: 1, name: "Yehuda Katz" });

  transaction = store.transaction();
  var record = store.find(Person, 1);

  transaction.add(record);
  transaction.remove(record);

  set(record, 'name', "shuck it trebek");

  transaction.commit();

  equal(updateCalled, 0, "after removing from transaction it does not commit");

  store.commit();

  equal(updateCalled, 1, "after removing from transaction it commits on the store");
});

test("a record that is in the created state cannot be moved into a new transaction", function() {
  var store = DS.Store.create();

  var person = store.createRecord(Person);
  transaction = store.transaction();

  raises(function() {
    transaction.add(person);
  }, Error);
});

test("a record that is in the updated state cannot be moved into a new transaction", function() {
  var store = DS.Store.create();

  store.load(Person, { id: 1 });
  var person = store.find(Person, 1);

  person.set('name', "Scumdale");
  transaction = store.transaction();

  raises(function() {
    transaction.add(person);
  }, Error);
});

test("a record that is in the deleted state cannot be moved into a new transaction", function() {
  var store = DS.Store.create();

  store.load(Person, { id: 1 });
  var person = store.find(Person, 1);

  person.deleteRecord();
  transaction = store.transaction();

  raises(function() {
    transaction.add(person);
  }, Error);
});

test("a record that is in the clean state is moved back to the default transaction after its transaction is committed", function() {
  var store = DS.Store.create();

  store.load(Person, { id: 1 });

  var person = store.find(Person, 1);

  transaction = store.transaction();
  transaction.add(person);
  transaction.commit();

  equal(get(person, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
});

test("modified records are reset when their transaction is rolled back", function() {

  var store = DS.Store.create({
    adapter: DS.Adapter.create({
      commit: function() {
        ok(false, "should never call adapter methods");
      }
    })
  });

  store.load(Person, { id: 1, name: "Scumbag Tom" });
  store.load(Person, { id: 2, name: "Scumbag Carl" });
  store.load(Person, { id: 3, name: "Scumbag André" });
  store.load(Person, { id: 4, name: "Scumbag Paul" });

  var updatedPerson = store.find(Person, 1);
  var deletedPerson = store.find(Person, 2);
  var anotherUpdatedPerson = store.find(Person, 3);
  var invalidPerson = store.find(Person, 4);

  transaction = store.transaction();
  transaction.add(updatedPerson);
  transaction.add(deletedPerson);
  transaction.add(anotherUpdatedPerson);
  transaction.add(invalidPerson);

  var newPerson = transaction.createRecord(Person, {
    name: "Scumbag Yehuda"
  });
  var anotherInvalidPerson = transaction.createRecord(Person, {});

  updatedPerson.set('name', "Scumbag Patrick");
  anotherUpdatedPerson.set('name', "Scumbag Leah");
  deletedPerson.deleteRecord();
  invalidPerson.set('name', null);
  invalidPerson.send('willCommit');
  store.recordWasInvalid(invalidPerson, {name: 'no name!'});
  anotherInvalidPerson.send('willCommit');
  store.recordWasInvalid(anotherInvalidPerson, {name: 'no name!'});

  equal(updatedPerson.get('isDirty'), true, "precond - Record is marked as dirty when changed");
  equal(updatedPerson.get('name'), "Scumbag Patrick", "precond - Record has been changed to the value we set");
  equal(anotherUpdatedPerson.get('isDirty'), true, "precond - Record is marked as dirty when changed");
  equal(anotherUpdatedPerson.get('name'), "Scumbag Leah", "precond - Record has been changed to the value we set");
  equal(newPerson.get('isDirty'), true, "precond - new record is marked as dirty");
  equal(newPerson.get('isNew'), true, "precond - new record is marked as new");
  equal(deletedPerson.get('isDirty'), true, "precond - deleted record is marked as dirty when deleted");
  equal(deletedPerson.get('isDeleted'), true, "precond - deleted record is marked as deleted");
  equal(invalidPerson.get('isDirty'), true, "precond - invalid record is marked as dirty");
  equal(invalidPerson.get('isValid'), false, "precond - invalid record is marked as invalid");
  equal(anotherInvalidPerson.get('isDirty'), true, "precond - invalid record is marked as dirty");
  equal(anotherInvalidPerson.get('isNew'), true, "precond - invalid record is marked as dirty");
  equal(anotherInvalidPerson.get('isValid'), false, "precond - invalid record is marked as invalid");

  transaction.rollback();

  equal(updatedPerson.get('isDirty'), false, "Record is not dirty after rollback");
  equal(updatedPerson.get('name'), "Scumbag Tom", "Record has previously loaded name");
  equal(anotherUpdatedPerson.get('isDirty'), false, "Record is not dirty after rollback");
  equal(anotherUpdatedPerson.get('name'), "Scumbag André", "Record has previously loaded name");
  equal(newPerson.get('isDirty'), false, "created record is no longer considered dirty");
  equal(newPerson.get('isDeleted'), true, "created records are deleted when their transaction is rolled back");
  equal(deletedPerson.get('isDirty'), false, "deleted record is no longer considered dirty");
  equal(deletedPerson.get('isDeleted'), false, "deleted record is no longer considered deleted");
  equal(invalidPerson.get('isDirty'), false, "invalid record is no longer considered dirty");
  equal(invalidPerson.get('name'), "Scumbag Paul", "Record has previously loaded name");
  equal(invalidPerson.get('isValid'), true, "invalid record is marked as valid");
  equal(anotherInvalidPerson.get('isValid'), true, "invalid record is marked as valid");
  equal(anotherInvalidPerson.get('isDeleted'), true, "created records are deleted when their transaction is rolled back");

  equal(get(newPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(updatedPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(anotherUpdatedPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(deletedPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
  equal(get(invalidPerson, 'transaction'), get(store, 'defaultTransaction'), "record should have been moved back to the default transaction");
});

test("modified records are reset when their transaction is rolled back", function() {
  var store = DS.Store.create();

  store.load(Person, { id: 1, name: "Scumbag Tom" });

  var person = store.find(Person, 1);

  transaction = store.transaction();
  transaction.add(person);

  person.set('name', 'toto');

  store.recordWasInvalid(person, {name: 'error'});

  equal(person.get('isValid'), false, "precond - invalid record is marked as invalid");

  transaction.rollback();

  equal(person.get('isValid'), true, "invalid record is now marked as valid");
});

var Post = DS.Model.extend({
  title: DS.attr('string'),
  body: DS.attr('string')
});

var Comment = DS.Model.extend({
  body: DS.attr('string'),
  post: DS.belongsTo(Post)
});

Post.reopen({
  comments: DS.hasMany(Comment)
});

var store, adapter;
module("DS.Transaction - relationships", {
  setup: function() {
    adapter = DS.Adapter.create();
    store = DS.Store.create({
      adapter: adapter
    });
  },

  teardown: function() {
    if (transaction) { transaction.destroy(); }
    adapter.destroy();
    store.destroy();
  }
});

function expectRelationships(description) {
  var relationships = transaction.get('relationships').toArray(),
      relationship = relationships[0],
      count = description.count === undefined ? 1 : description.count;

  QUnit.push(relationships.length === count, relationships.length, count, "There should be " + count + " dirty relationships");

  if (count) {
    QUnit.push(relationship.getOldParent() === description.oldParent, relationship.oldParent, description.oldParent, "oldParent is incorrect");
    QUnit.push(relationship.getNewParent() === description.newParent, relationship.newParent, description.newParent, "newParent is incorrect");
    QUnit.push(relationship.getChild() === description.child, relationship.child, description.child, "child is incorrect");
  }
}

test("If both the parent and child are clean and in the same transaction, a dirty relationship is added to the transaction null->A", function() {
  store.load(Post, { id: 1, title: "Ohai", body: "FIRST POST ZOMG" });
  store.load(Comment, { id: 1, body: "Kthx" });

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 1);

  transaction = store.transaction();

  transaction.add(post);
  transaction.add(comment);

  post.get('comments').pushObject(comment);

  expectRelationships({
    oldParent: null,
    newParent: post,
    child: comment
  });
});

test("If a child is removed from a parent, a dirty relationship is added to the transaction A->null", function() {
  store.load(Comment, { id: 1, body: "Kthx" });
  store.load(Post, { id: 1, title: "Ohai", body: "FIRST POST ZOMG", comments: [ 1 ] });

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 1);

  transaction = store.transaction();

  transaction.add(post);
  transaction.add(comment);

  post.get('comments').removeObject(comment);

  expectRelationships({
    oldParent: post,
    newParent: null,
    child: comment
  });
});

test("If a child is removed from a parent it was recently added to, the dirty relationship is removed. null->A, A->null", function() {
  store.load(Comment, { id: 1, body: "Kthx" });
  store.load(Post, { id: 1, title: "Ohai", body: "FIRST POST ZOMG", comments: [ 1 ] });

  var post = store.find(Post, 1);
  var comment = store.find(Comment, 1);

  transaction = store.transaction();

  transaction.add(post);
  transaction.add(comment);

  post.get('comments').removeObject(comment);
  post.get('comments').pushObject(comment);

  expectRelationships({ count: 0 });
});

test("If a child was added to one parent, and then another, the changes coalesce. A->B, B->C", function() {
  store.load(Comment, { id: 1, body: "Kthx" });
  store.load(Post, { id: 1, title: "Ohai", body: "FIRST POST ZOMG", comments: [ 1 ] });
  store.load(Post, { id: 2, title: "ZOMG", body: "SECOND POST WAT" });
  store.load(Post, { id: 3, title: "ORLY?", body: "Why am I still here?" });

  var post = store.find(Post, 1);
  var post2 = store.find(Post, 2);
  var post3 = store.find(Post, 3);
  var comment = store.find(Comment, 1);

  transaction = store.transaction();

  transaction.add(post);
  transaction.add(comment);

  post.get('comments').removeObject(comment);
  post2.get('comments').pushObject(comment);
  post2.get('comments').removeObject(comment);
  post3.get('comments').pushObject(comment);

  expectRelationships({
    oldParent: post,
    newParent: post3,
    child: comment
  });
});

test("the store should have a new defaultTransaction after commit from store", function() {
  store.load(Post, { id: 1, title: "Ohai" });

  var record = store.find(Post, 1);
  var transaction = record.get('transaction');
  var defaultTransaction = store.get('defaultTransaction');

  equal(transaction, defaultTransaction, 'record is in the defaultTransaction');

  store.commit();

  var newDefaultTransaction = store.get('defaultTransaction');
  transaction = record.get('transaction');

  ok(defaultTransaction !== newDefaultTransaction, "store should have a new defaultTransaction");
  equal(transaction, newDefaultTransaction, 'record is in the new defaultTransaction');
});

test("the store should have a new defaultTransaction after commit from defaultTransaction", function() {
  store.load(Post, { id: 1, title: "Ohai" });

  var record = store.find(Post, 1);
  var transaction = record.get('transaction');
  var defaultTransaction = store.get('defaultTransaction');

  equal(transaction, defaultTransaction, 'record is in the defaultTransaction');

  defaultTransaction.commit();

  var newDefaultTransaction = store.get('defaultTransaction');
  transaction = record.get('transaction');

  ok(defaultTransaction !== newDefaultTransaction, "store should have a new defaultTransaction");
  equal(transaction, newDefaultTransaction, 'record is in the new defaultTransaction');
});

test("the store should have a new defaultTransaction after commit from record's transaction", function() {
  store.load(Post, { id: 1, title: "Ohai" });

  var record = store.find(Post, 1);
  var transaction = record.get('transaction');
  var defaultTransaction = store.get('defaultTransaction');

  equal(transaction, defaultTransaction, 'record is in the defaultTransaction');

  transaction.commit();

  var newDefaultTransaction = store.get('defaultTransaction');
  transaction = record.get('transaction');

  ok(defaultTransaction !== newDefaultTransaction, "store should have a new defaultTransaction");
  equal(transaction, newDefaultTransaction, 'record is in the new defaultTransaction');
});
