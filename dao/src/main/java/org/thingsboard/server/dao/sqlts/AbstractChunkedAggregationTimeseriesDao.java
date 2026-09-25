/**
 * Copyright © 2016-2025 The Thingsboard Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.thingsboard.server.dao.sqlts;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort.Direction;
import org.thingsboard.server.common.data.id.EntityId;
import org.thingsboard.server.common.data.id.TenantId;
import org.thingsboard.server.common.data.kv.Aggregation;
import org.thingsboard.server.common.data.kv.DeleteTsKvQuery;
import org.thingsboard.server.common.data.kv.IntervalType;
import org.thingsboard.server.common.data.kv.ReadTsKvQuery;
import org.thingsboard.server.common.data.kv.ReadTsKvQueryResult;
import org.thingsboard.server.common.data.kv.TsKvEntry;
import org.thingsboard.server.common.stats.StatsFactory;
import org.thingsboard.server.dao.DaoUtil;
import org.thingsboard.server.dao.dictionary.KeyDictionaryDao;
import org.thingsboard.server.dao.model.sql.AbstractTsKvEntity;
import org.thingsboard.server.dao.model.sqlts.ts.TsKvEntity;
import org.thingsboard.server.dao.sql.TbSqlBlockingQueueParams;
import org.thingsboard.server.dao.sql.TbSqlBlockingQueueWrapper;
import org.thingsboard.server.dao.sqlts.insert.InsertTsRepository;
import org.thingsboard.server.dao.sqlts.ts.TsKvRepository;
import org.thingsboard.server.dao.timeseries.TimeseriesDao;
import org.thingsboard.server.dao.util.TimeUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@SuppressWarnings("UnstableApiUsage")
@Slf4j
public abstract class AbstractChunkedAggregationTimeseriesDao extends AbstractSqlTimeseriesDao implements TimeseriesDao {

    @Autowired
    protected TsKvRepository tsKvRepository;

    @Autowired
    protected InsertTsRepository<TsKvEntity> insertRepository;

    protected TbSqlBlockingQueueWrapper<TsKvEntity, Void> tsQueue;
    @Autowired
    private StatsFactory statsFactory;

    @Autowired
    private KeyDictionaryDao keyDictionaryDao;

    @PostConstruct
    protected void init() {
        TbSqlBlockingQueueParams tsParams = TbSqlBlockingQueueParams.builder()
                .logName("TS")
                .batchSize(tsBatchSize)
                .maxDelay(tsMaxDelay)
                .statsPrintIntervalMs(tsStatsPrintIntervalMs)
                .statsNamePrefix("ts")
                .batchSortEnabled(batchSortEnabled)
                .build();

        Function<TsKvEntity, Integer> hashcodeFunction = entity -> entity.getEntityId().hashCode();
        tsQueue = new TbSqlBlockingQueueWrapper<>(tsParams, hashcodeFunction, tsBatchThreads, statsFactory);
        tsQueue.init(logExecutor, v -> insertRepository.saveOrUpdate(v),
                Comparator.comparing((Function<TsKvEntity, UUID>) AbstractTsKvEntity::getEntityId)
                        .thenComparing(AbstractTsKvEntity::getKey)
                        .thenComparing(AbstractTsKvEntity::getTs)
        );
    }

    @PreDestroy
    protected void destroy() {
        if (tsQueue != null) {
            tsQueue.destroy();
        }
    }

    @Override
    public ListenableFuture<Void> remove(TenantId tenantId, EntityId entityId, DeleteTsKvQuery query) {
        return service.submit(() -> {
            tsKvRepository.delete(
                    entityId.getId(),
                    keyDictionaryDao.getOrSaveKeyId(query.getKey()),
                    query.getStartTs(),
                    query.getEndTs());
            return null;
        });
    }

    @Override
    public ListenableFuture<Integer> savePartition(TenantId tenantId, EntityId entityId, long tsKvEntryTs, String key) {
        return Futures.immediateFuture(null);
    }

    @Override
    public ListenableFuture<List<ReadTsKvQueryResult>> findAllAsync(TenantId tenantId, EntityId entityId, List<ReadTsKvQuery> queries) {
        return processFindAllAsync(tenantId, entityId, queries);
    }

    @Override
    public ListenableFuture<List<ReadTsKvQueryResult>> findLatestInRange(
            TenantId tenantId,
            EntityId entityId,
            List<ReadTsKvQuery> queries) {

        if (queries == null || queries.isEmpty()) {
            return Futures.immediateFuture(Collections.emptyList());
        }

        ReadTsKvQuery first = queries.get(0);
        long startTs = first.getStartTs();
        long endTs = first.getEndTs();

        boolean compatible = queries.stream().allMatch(query ->
                query.getStartTs() == startTs
                        && query.getEndTs() == endTs
                        && query.getLimit() == 1
                        && Aggregation.NONE.equals(query.getAggregation())
                        && Direction.DESC.name().equalsIgnoreCase(query.getOrder()));

        if (!compatible) {
            return processFindAllAsync(tenantId, entityId, queries);
        }

        return service.submit(() -> {
            Map<String, Integer> keyIds = new HashMap<>();

            for (ReadTsKvQuery query : queries) {
                keyIds.computeIfAbsent(
                        query.getKey(),
                        keyDictionaryDao::getOrSaveKeyId);
            }

            List<TsKvEntity> entities = findLatestInRangeWithJdbc(
                    entityId.getId(),
                    keyIds.values(),
                    startTs,
                    endTs);

            Map<Integer, TsKvEntity> entityByKey = entities.stream()
                    .collect(Collectors.toMap(
                            TsKvEntity::getKey,
                            Function.identity(),
                            (left, right) -> left));

            List<ReadTsKvQueryResult> results =
                    new ArrayList<>(queries.size());

            for (ReadTsKvQuery query : queries) {
                TsKvEntity entity =
                        entityByKey.get(keyIds.get(query.getKey()));

                List<TsKvEntry> data;

                if (entity == null) {
                    data = Collections.emptyList();
                } else {
                    entity.setStrKey(query.getKey());
                    data = DaoUtil.convertDataList(List.of(entity));
                }

                long lastTs = data.stream()
                        .map(TsKvEntry::getTs)
                        .max(Long::compare)
                        .orElse(query.getStartTs());

                results.add(
                        new ReadTsKvQueryResult(
                                query.getId(),
                                data,
                                lastTs));
            }

            return results;
        });
    }

    private List<TsKvEntity> findLatestInRangeWithJdbc(
            UUID entityId,
            Collection<Integer> entityKeys,
            long startTs,
            long endTs) {

        if (entityKeys.isEmpty()) {
            return Collections.emptyList();
        }

        String values = String.join(
                ", ",
                Collections.nCopies(entityKeys.size(), "(?)"));

        String sql =
                "SELECT t.* " +
                "FROM (VALUES " + values + ") AS k(key) " +
                "CROSS JOIN LATERAL (" +
                "    SELECT x.* " +
                "    FROM ts_kv x " +
                "    WHERE x.entity_id = ? " +
                "      AND x.key = k.key " +
                "      AND x.ts >= ? " +
                "      AND x.ts < ? " +
                "    ORDER BY x.ts DESC " +
                "    LIMIT 1" +
                ") t";

        List<Object> params =
                new ArrayList<>(entityKeys.size() + 3);

        params.addAll(entityKeys);
        params.add(entityId);
        params.add(startTs);
        params.add(endTs);

        return jdbcTemplate.query(
                sql,
                (rs, rowNum) -> {
                    TsKvEntity entity = new TsKvEntity();

                    entity.setEntityId(
                            rs.getObject("entity_id", UUID.class));
                    entity.setKey(
                            rs.getInt("key"));
                    entity.setTs(
                            rs.getLong("ts"));
                    entity.setBooleanValue(
                            rs.getObject("bool_v", Boolean.class));
                    entity.setStrValue(
                            rs.getString("str_v"));
                    entity.setLongValue(
                            rs.getObject("long_v", Long.class));
                    entity.setDoubleValue(
                            rs.getObject("dbl_v", Double.class));
                    entity.setJsonValue(
                            rs.getString("json_v"));

                    return entity;
                },
                params.toArray());
    }

    @Override
    public ListenableFuture<ReadTsKvQueryResult> findAllAsync(TenantId tenantId, EntityId entityId, ReadTsKvQuery query) {
        var aggParams = query.getAggParameters();
        if (Aggregation.NONE.equals(aggParams.getAggregation()) || aggParams.getInterval() < 1) {
            return Futures.immediateFuture(findAllAsyncWithLimit(entityId, query));
        } else {
            List<ListenableFuture<Optional<TsKvEntity>>> futures = new ArrayList<>();
            var intervalType = aggParams.getIntervalType();
            long startPeriod = query.getStartTs();
            long endPeriod = Math.max(query.getStartTs() + 1, query.getEndTs());
            while (startPeriod < endPeriod) {
                long startTs = startPeriod;
                long endTs;
                if (IntervalType.MILLISECONDS.equals(intervalType)) {
                    endTs = startPeriod + aggParams.getInterval();
                } else {
                    endTs = TimeUtils.calculateIntervalEnd(startTs, intervalType, aggParams.getTzId());
                }
                endTs = Math.min(endTs, endPeriod);
                long ts = startTs + (endTs - startTs) / 2;
                ListenableFuture<Optional<TsKvEntity>> aggregateTsKvEntry = findAndAggregateAsync(entityId, query.getKey(), startTs, endTs, ts, query.getAggregation());
                futures.add(aggregateTsKvEntry);
                startPeriod = endTs;
            }
            return getReadTsKvQueryResultFuture(query, Futures.allAsList(futures));
        }
    }

    ReadTsKvQueryResult findAllAsyncWithLimit(EntityId entityId, ReadTsKvQuery query) {
        Integer keyId = keyDictionaryDao.getOrSaveKeyId(query.getKey());
        List<TsKvEntity> tsKvEntities = tsKvRepository.findAllWithLimit(
                entityId.getId(),
                keyId,
                query.getStartTs(),
                query.getEndTs(),
                PageRequest.ofSize(query.getLimit()).withSort(Direction.fromString(query.getOrder()), "ts"));
        tsKvEntities.forEach(tsKvEntity -> tsKvEntity.setStrKey(query.getKey()));
        List<TsKvEntry> tsKvEntries = DaoUtil.convertDataList(tsKvEntities);
        long lastTs = tsKvEntries.stream().map(TsKvEntry::getTs).max(Long::compare).orElse(query.getStartTs());
        return new ReadTsKvQueryResult(query.getId(), tsKvEntries, lastTs);
    }

    ListenableFuture<Optional<TsKvEntity>> findAndAggregateAsync(EntityId entityId, String key, long startTs, long endTs, long ts, Aggregation aggregation) {
        return service.submit(() -> {
            TsKvEntity entity = switchAggregation(entityId, key, startTs, endTs, aggregation);
            if (entity != null && entity.isNotEmpty()) {
                entity.setEntityId(entityId.getId());
                entity.setStrKey(key);
                entity.setTs(ts);
                return Optional.of(entity);
            } else {
                return Optional.empty();
            }
        });
    }

    protected TsKvEntity switchAggregation(EntityId entityId, String key, long startTs, long endTs, Aggregation aggregation) {
        var keyId = keyDictionaryDao.getOrSaveKeyId(key);
        switch (aggregation) {
            case AVG:
                return tsKvRepository.findAvg(entityId.getId(), keyId, startTs, endTs);
            case MAX:
                var max = tsKvRepository.findNumericMax(entityId.getId(), keyId, startTs, endTs);
                if (max.isNotEmpty()) {
                    return max;
                } else {
                    return tsKvRepository.findStringMax(entityId.getId(), keyId, startTs, endTs);
                }
            case MIN:
                var min = tsKvRepository.findNumericMin(entityId.getId(), keyId, startTs, endTs);
                if (min.isNotEmpty()) {
                    return min;
                } else {
                    return tsKvRepository.findStringMin(entityId.getId(), keyId, startTs, endTs);
                }
            case SUM:
                return tsKvRepository.findSum(entityId.getId(), keyId, startTs, endTs);
            case COUNT:
                return tsKvRepository.findCount(entityId.getId(), keyId, startTs, endTs);
            default:
                throw new IllegalArgumentException("Not supported aggregation type: " + aggregation);
        }
    }
}
